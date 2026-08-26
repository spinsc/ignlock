#include "cellular_client.h"
#include "config.h"

static HardwareSerial modemSerial(1); // UART1 do ESP32, dedicado ao SIM7600

bool CellularClient::waitFor(const String &expect, uint32_t timeoutMs, String *outBuffer) {
    String buf;
    uint32_t start = millis();
    while (millis() - start < timeoutMs) {
        while (modemSerial.available()) {
            buf += (char)modemSerial.read();
            if (buf.indexOf(expect) != -1) {
                if (outBuffer) *outBuffer = buf;
                return true;
            }
        }
    }
    if (outBuffer) *outBuffer = buf;
    return false;
}

String CellularClient::sendAtCommand(const String &cmd, const String &expect, uint32_t timeoutMs) {
    while (modemSerial.available()) modemSerial.read(); // limpa lixo pendente
    modemSerial.print(cmd);
    modemSerial.print("\r\n");
    String resp;
    waitFor(expect, timeoutMs, &resp);
    return resp;
}

bool CellularClient::begin() {
    modemSerial.begin(MODEM_BAUD, SERIAL_8N1, PIN_MODEM_RX, PIN_MODEM_TX);
    delay(3000); // tempo de boot do módulo após energizado

    for (int tries = 0; tries < 5; tries++) {
        String r = sendAtCommand("AT", "OK", 2000);
        if (r.indexOf("OK") != -1) {
            Serial.println("[CELL] Modulo respondeu AT.");
            sendAtCommand("ATE0", "OK", 2000); // desliga eco, facilita o parsing
            return true;
        }
        delay(1000);
    }
    Serial.println("[CELL] FALHA: modulo nao respondeu a AT.");
    return false;
}

bool CellularClient::waitForNetworkRegistration(uint32_t timeoutMs) {
    sendAtCommand(String("AT+CGDCONT=1,\"IP\",\"") + CELLULAR_APN + "\"", "OK", 3000);

    uint32_t start = millis();
    while (millis() - start < timeoutMs) {
        String r = sendAtCommand("AT+CGREG?", "OK", 3000);
        // Resposta esperada: +CGREG: 0,1  (registrado, rede local) ou 0,5 (roaming)
        if (r.indexOf(",1") != -1 || r.indexOf(",5") != -1) {
            Serial.println("[CELL] Registrado na rede.");
            return true;
        }
        delay(2000);
    }
    Serial.println("[CELL] FALHA: timeout aguardando registro na rede.");
    return false;
}

bool CellularClient::enableGnss() {
    String r = sendAtCommand("AT+CGPS=1,1", "OK", 5000);
    return r.indexOf("OK") != -1;
}

static double nmeaCoordToDecimal(const String &raw, bool isLongitude) {
    // ddmm.mmmmmm (latitude) ou dddmm.mmmmmm (longitude)
    int degDigits = isLongitude ? 3 : 2;
    if (raw.length() < (unsigned)degDigits) return 0.0;
    double degrees = raw.substring(0, degDigits).toDouble();
    double minutes = raw.substring(degDigits).toDouble();
    return degrees + (minutes / 60.0);
}

GnssFix CellularClient::readGnssFix() {
    GnssFix fix;
    String r = sendAtCommand("AT+CGPSINFO", "OK", 3000);

    int idx = r.indexOf("+CGPSINFO:");
    if (idx == -1) return fix;

    String line = r.substring(idx + 10);
    line.trim();

    // Campos: lat,N/S,lon,E/W,ddmmyy,hhmmss.s,alt,speed(nós),curso
    String fields[9];
    int fieldCount = 0;
    int start = 0;
    for (int i = 0; i < (int)line.length() && fieldCount < 9; i++) {
        if (line[i] == ',') {
            fields[fieldCount++] = line.substring(start, i);
            start = i + 1;
        }
    }
    if (fieldCount < 8) fields[fieldCount++] = line.substring(start);

    if (fields[0].length() == 0) {
        // Campos vazios = ainda sem fix de GNSS.
        return fix;
    }

    fix.latitude = nmeaCoordToDecimal(fields[0], false);
    if (fields[1] == "S") fix.latitude = -fix.latitude;

    fix.longitude = nmeaCoordToDecimal(fields[2], true);
    if (fields[3] == "W") fix.longitude = -fix.longitude;

    if (fieldCount > 7) fix.speedKmh = fields[7].toFloat() * 1.852f; // nós -> km/h
    if (fieldCount > 8) fix.headingDeg = fields[8].toFloat();

    fix.valid = true;
    return fix;
}

String CellularClient::readNetworkTimeIso8601() {
    // Resposta típica: +CCLK: "26/08/26,14:30:00-12" (offset em quartos de hora)
    String r = sendAtCommand("AT+CCLK?", "OK", 3000);
    int idx = r.indexOf('"');
    int idx2 = r.indexOf('"', idx + 1);
    if (idx == -1 || idx2 == -1) return "";

    String ts = r.substring(idx + 1, idx2); // yy/MM/dd,hh:mm:ss+-qq
    if (ts.length() < 17) return "";

    int yy = ts.substring(0, 2).toInt();
    int MM = ts.substring(3, 5).toInt();
    int dd = ts.substring(6, 8).toInt();
    int hh = ts.substring(9, 11).toInt();
    int mm = ts.substring(12, 14).toInt();
    int ss = ts.substring(15, 17).toInt();

    char buf[32];
    // Envia o horário local do módulo como está — o campo de fuso do SIM7600
    // costuma refletir o horário de rede local, não UTC; ajustar aqui se a
    // operadora usada reportar algo diferente do horário de Brasília.
    snprintf(buf, sizeof(buf), "20%02d-%02d-%02dT%02d:%02d:%02dZ", yy, MM, dd, hh, mm, ss);
    return String(buf);
}

bool CellularClient::httpPostJson(const String &path, const String &jsonBody) {
    sendAtCommand("AT+HTTPTERM", "", 500); // limpa sessão HTTP anterior, se houver
    sendAtCommand("AT+HTTPINIT", "OK", 3000);
    sendAtCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000);
    sendAtCommand(String("AT+HTTPPARA=\"URL\",\"") + SUPABASE_URL + path + "\"", "OK", 3000);
    sendAtCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);

    String headers = String("apikey: ") + SUPABASE_ANON_KEY + "\r\n" +
                      "Authorization: Bearer " + SUPABASE_ANON_KEY + "\r\n" +
                      "Prefer: return=minimal";
    sendAtCommand(String("AT+HTTPPARA=\"USERDATA\",\"") + headers + "\"", "OK", 2000);

    String dataCmd = "AT+HTTPDATA=" + String(jsonBody.length()) + ",10000";
    modemSerial.print(dataCmd);
    modemSerial.print("\r\n");
    if (!waitFor("DOWNLOAD", 5000)) {
        Serial.println("[CELL] FALHA: modulo nao pediu DOWNLOAD para o corpo HTTP.");
        sendAtCommand("AT+HTTPTERM", "", 500);
        return false;
    }
    modemSerial.print(jsonBody);
    waitFor("OK", 5000);

    String actionResp;
    modemSerial.print("AT+HTTPACTION=1\r\n"); // 1 = POST
    bool got = waitFor("+HTTPACTION:", 15000, &actionResp);
    sendAtCommand("AT+HTTPTERM", "", 1000);

    if (!got) {
        Serial.println("[CELL] FALHA: sem resposta de AT+HTTPACTION (POST).");
        return false;
    }

    // Formato: +HTTPACTION: 1,<status>,<tamanho>
    int idx = actionResp.indexOf("+HTTPACTION:");
    int statusCode = -1;
    if (idx != -1) {
        int firstComma = actionResp.indexOf(',', idx);
        int secondComma = actionResp.indexOf(',', firstComma + 1);
        if (firstComma != -1 && secondComma != -1) {
            statusCode = actionResp.substring(firstComma + 1, secondComma).toInt();
        }
    }

    Serial.printf("[CELL] POST %s -> status %d\n", path.c_str(), statusCode);
    return statusCode >= 200 && statusCode < 300;
}
