"""
Roteamento e verificação da placa IGNLOCK (face única, transferência térmica).
Ver notas no topo da versão anterior -- este arquivo e' a versão 2, com a
pinagem do U2 reordenada topologicamente para eliminar a maior parte dos
cruzamentos (SDA/SCL saem perto do RTC1, no topo; GPIO25/26 saem embaixo,
sem nada que precise "pular por cima" deles).
"""

import itertools

PADS = {
    # U2 ESP32 -- pinagem reordenada (topo->baixo): VIN, 3V3, SDA, SCL, GND, GPIO26, GPIO25
    "U2.VIN":    (37.4, 21.62),
    "U2.3V3":    (37.4, 24.7),
    "U2.SDA":    (37.4, 27.8),
    "U2.SCL":    (37.4, 30.9),
    "U2.GND":    (37.4, 34.0),
    "U2.GPIO26": (37.4, 40.0),
    "U2.GPIO25": (37.4, 45.0),

    # RTC1 DS3231 (borda inferior do modulo, y=26.7) -- GND por ultimo
    # (mais a direita) de proposito: assim a descida dele nao cruza as
    # trilhas de SDA/SCL, que saem para a esquerda em direcao ao U2.
    "RTC1.VCC": (45.0, 26.7),
    "RTC1.SDA": (47.54, 26.7),
    "RTC1.SCL": (50.08, 26.7),
    "RTC1.GND": (52.62, 26.7),

    # C2 x2 (decoupling, perto de VIN/3V3)
    "C2A.a": (42.48, 21.62), "C2A.b": (42.48, 19.5),
    "C2B.a": (42.48, 24.7), "C2B.b": (42.48, 22.6),

    # LED1 + R4 (perto de GPIO26)
    "LED1.a": (45.02, 38.9), "LED1.b": (45.02, 41.1),
    "R4.a": (43.9, 40.0), "R4.b": (46.15, 40.0),

    # R1 (perto de GPIO25, caminho ate U1)
    "R1.a": (43.9, 45.0), "R1.b": (46.15, 45.0),

    # U1 PC817 (DIP-4)
    "U1.1": (50.08, 58.0), "U1.2": (50.08, 62.8),
    "U1.4": (55.16, 58.0), "U1.3": (55.16, 62.8),

    # PS1 buck
    "PS1.IN+": (14.54, 87.66), "PS1.IN-": (17.08, 87.66),
    "PS1.OUT+": (22.16, 87.66), "PS1.OUT-": (24.7, 87.66),

    # C1
    "C1.a": (14.54, 77.5), "C1.b": (14.54, 80.04),

    # F1 (fusivel logico)
    "F1.top": (57.7, 19.08), "F1.bot": (57.7, 24.16),
    "CN_IGN": (57.7, 16.5),

    # F2 (fusivel potencia) e rail +12V_PERM
    "F2.top": (75.5, 19.08), "F2.bot": (75.5, 27.08),
    "CN_BAT": (75.5, 16.5),

    "R2.a": (75.5, 33.3), "R2.b": (70.4, 33.3),
    "D3.a": (75.5, 39.4), "D3.b": (70.4, 39.4),
    "GATE": (70.4, 36.35),
    "R3.a": (65.34, 43.4), "R3.b": (65.34, 45.6),

    "Q1.S": (71.7, 54.64), "Q1.G": (67.88, 59.5), "Q1.D": (71.7, 67.34),
    "D1.a": (75.5, 71.2), "D1.b": (75.5, 73.64),

    "CN_PUMP": (71.7, 97.86),
    "CN_GND":  (57.7, 97.86),
}

GND_BUS_Y = 95.3
GND_BUS_X0, GND_BUS_X1 = 14.54, 75.5
GND_SPINE_X = 60.0

NETS = {}
JUMPERS = []  # pares de redes com cruzamento aceito de proposito (ponte de fio)

def net(name, points):
    segs = []
    for a, b in zip(points, points[1:]):
        assert a[0] == b[0] or a[1] == b[1], f"{name}: segmento nao ortogonal {a}->{b}"
        if a != b:
            segs.append((a, b))
    NETS[name] = segs

P = PADS

# --- Linha 15 -> F1 -> PS1.IN+ (rota pela direita/topo, longe do enxame de GND) ---
net("IGN_F1_PS1IN", [P["CN_IGN"], (57.7, 19.08), P["F1.top"]])
net("F1_TO_PS1IN", [P["F1.bot"], (63.0, 24.16), (63.0, 15.5), (10.0, 15.5), (10.0, 87.66), P["PS1.IN+"]])

# --- PS1.OUT+ -> U2.VIN ---
net("PS1OUT_TO_VIN", [P["PS1.OUT+"], (22.16, 89.5), (6.5, 89.5), (6.5, 21.62), P["U2.VIN"]])

# --- C1 (no pad PS1.IN+, filtro de entrada) ---
# CORREÇÃO: C1 é um capacitor -- suas duas pernas NÃO podem ser ligadas
# por trilha direta (isso curto-circuitaria o filtro). A perna quente
# (C1.a) liga no nó +12V_SW (mesma rede de F1->PS1.IN+); a perna fria
# (C1.b) liga no GND (já coberto por GND_C1B, abaixo).
net("C1_TO_LINHA15", [P["C1.a"], (10.0, 77.5)])

# --- Decoupling C2 x2 ---
net("C2A_TO_VIN", [P["C2A.a"], P["U2.VIN"]])
net("C2B_TO_3V3", [P["C2B.a"], P["U2.3V3"]])

# --- RTC1 (I2C + alimentação) -- tudo perto do topo, hop curto e direto ---
net("RTC_VCC", [P["RTC1.VCC"], (45.0, 24.7), P["U2.3V3"]])
net("RTC_SDA", [P["RTC1.SDA"], (47.54, 27.8), P["U2.SDA"]])
net("RTC_SCL", [P["RTC1.SCL"], (50.08, 30.9), P["U2.SCL"]])

# --- LED1 / R4 (status, perto de GPIO26) ---
net("GPIO26_TO_R4", [P["U2.GPIO26"], P["R4.a"]])
net("R4_TO_LED1", [P["R4.b"], (45.02, 40.0), P["LED1.a"]])

# --- R1 -> U1 pino 1 (perto de GPIO25) ---
net("GPIO25_TO_R1", [P["U2.GPIO25"], P["R1.a"]])
net("R1_TO_U1PIN1", [P["R1.b"], (50.08, 45.0), P["U1.1"]])

# --- Gate drive ---
net("U1PIN4_TO_GATE", [P["U1.4"], (58.0, 58.0), (58.0, 36.35), P["GATE"]])
net("R2_TO_GATE", [P["R2.b"], P["GATE"]])
net("R2_TO_RAIL", [P["R2.a"], P["F2.bot"]])
net("D3_TO_GATE", [P["D3.b"], P["GATE"]])
net("D3_TO_RAIL", [P["D3.a"], (75.5, 39.4), (75.5, 27.08)])
net("GATE_TO_R3", [P["GATE"], (65.34, 36.35), P["R3.a"]])
net("R3_TO_GATE_Q1", [P["R3.b"], (65.34, 59.5), P["Q1.G"]])

# --- D1 TVS ---
net("Q1D_TO_D1", [P["Q1.D"], (75.5, 67.34), P["D1.a"]])
net("D1_TO_GND", [P["D1.b"], (75.5, 95.3)])

# --- GND: tronco horizontal em y=34 (abaixo de tudo que sai de RTC1/C2/U2
# nessa regiao) recolhe os drops locais, depois sobe uma unica vez para a
# espinha vertical em x=60 por um ponto (55,20) livre de qualquer outra rede.
net("GND_SPINE", [(GND_SPINE_X, 20.0), (GND_SPINE_X, GND_BUS_Y)])
net("GND_TRUNK", [(37.9, 34.0), (55.0, 34.0), (55.0, 20.0), (GND_SPINE_X, 20.0)])
net("GND_U2", [P["U2.GND"], (37.9, 34.0)])
net("GND_RTC1", [P["RTC1.GND"], (52.62, 34.0)])
# C2A/C2B: a perna de GND desses 2 desacopladores fica cercada pelas
# trilhas de VIN/3V3/SDA/SCL nesta area -- em vez de forcar trilha por
# cima delas, essa perna vira FIO VOADOR curto direto ate o ponto de GND
# mais proximo (pratica normal para capacitor de desacoplamento pequeno).
# Por isso nao entra no modelo de trilhas de cobre.
net("GND_LED1", [P["LED1.b"], (49.0, 41.1), (49.0, 34.0)])
net("GND_U1PIN2", [P["U1.2"], (GND_SPINE_X, 62.8)])
net("GND_U1PIN3", [P["U1.3"], (55.16, 65.0), (GND_SPINE_X, 65.0)])
net("GND_PS1IN-", [P["PS1.IN-"], (17.08, GND_BUS_Y)])
net("GND_PS1OUT-", [P["PS1.OUT-"], (24.7, GND_BUS_Y)])
net("GND_C1B", [P["C1.b"], (12.0, 80.04), (12.0, GND_BUS_Y)])
net("GND_CNGND", [P["CN_GND"], (57.7, GND_BUS_Y)])
net("GND_BUS", [(GND_BUS_X0, GND_BUS_Y), (GND_BUS_X1, GND_BUS_Y)])

GROUP = {
    "IGN_F1_PS1IN": "LINHA15", "F1_TO_PS1IN": "LINHA15",
    "PS1OUT_TO_VIN": "VIN", "C2A_TO_VIN": "VIN",
    "C2B_TO_3V3": "3V3", "RTC_VCC": "3V3",
    "GPIO26_TO_R4": "LED_NET", "R4_TO_LED1": "LED_NET",
    "GPIO25_TO_R1": "R1_NET", "R1_TO_U1PIN1": "R1_NET",
    "U1PIN4_TO_GATE": "GATE", "R2_TO_GATE": "GATE", "D3_TO_GATE": "GATE", "GATE_TO_R3": "GATE",
    "R2_TO_RAIL": "RAIL12", "D3_TO_RAIL": "RAIL12",
    "R3_TO_GATE_Q1": "R3_Q1",
    "Q1D_TO_D1": "DRAIN", "D1_TO_GND": "GND",
    "C1_TO_LINHA15": "LINHA15",
}
for n in NETS:
    if n.startswith("GND"):
        GROUP[n] = "GND"

def seg_key(net_name):
    return GROUP.get(net_name, net_name)

def orient(a, b, c):
    v = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
    return 0 if abs(v) < 1e-9 else (1 if v > 0 else -1)

def on_seg(a, b, p):
    return min(a[0],b[0])-1e-9 <= p[0] <= max(a[0],b[0])+1e-9 and min(a[1],b[1])-1e-9 <= p[1] <= max(a[1],b[1])+1e-9

def segs_touch(s1, s2):
    a, b = s1; c, d = s2
    o1, o2, o3, o4 = orient(a,b,c), orient(a,b,d), orient(c,d,a), orient(c,d,b)
    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and on_seg(a,b,c): return True
    if o2 == 0 and on_seg(a,b,d): return True
    if o3 == 0 and on_seg(c,d,a): return True
    if o4 == 0 and on_seg(c,d,b): return True
    return False

conflicts = []
all_nets = list(NETS.items())
for (n1, segs1), (n2, segs2) in itertools.combinations(all_nets, 2):
    if seg_key(n1) == seg_key(n2):
        continue
    for s1 in segs1:
        for s2 in segs2:
            if segs_touch(s1, s2):
                conflicts.append((n1, s1, n2, s2))

print(f"Total de redes: {len(NETS)}  |  segmentos: {sum(len(v) for v in NETS.values())}")
print(f"CONFLITOS: {len(conflicts)}")
for c in conflicts:
    print("  ", c)
