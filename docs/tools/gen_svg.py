import route_pcb as R

BOARD_X, BOARD_Y, BOARD_W, BOARD_H = 8, 10, 76, 97
TRACE_W = 0.7
BUS_W = 1.2
PAD_R = 1.0
DRILL_R = 0.45

# (rede, ponto_de_corte) -> essa rede recebe um gap de jumper nesse ponto exato
JUMPERS = {
    ("PS1OUT_TO_VIN", (10.0, 21.62)),
    ("F1_TO_PS1IN", (60.0, 24.16)),
    ("F1_TO_PS1IN", (12.0, 87.66)),
    ("PS1OUT_TO_VIN", (17.08, 89.5)),
    ("PS1OUT_TO_VIN", (12.0, 89.5)),
    ("U1PIN4_TO_GATE", (60.0, 36.35)),
}
GAP = 1.6  # mm de vao aberto no ponto do jumper

def mirror_x(x):
    return BOARD_X + BOARD_W - (x - BOARD_X)

def seg_width(name):
    return BUS_W if ("GND" in name or name in ("R2_TO_RAIL", "D3_TO_RAIL")) else TRACE_W

def split_for_jumpers(name, seg):
    """Se este segmento contem 1+ pontos de jumper marcados p/ esta rede,
    devolve os sub-segmentos com vaos nesses pontos; senao so o original."""
    (x1, y1), (x2, y2) = seg
    hits = []
    for (jname, (jx, jy)) in JUMPERS:
        if jname != name:
            continue
        if x1 == x2 == jx and min(y1, y2) <= jy <= max(y1, y2):
            hits.append(jy if y1 != y2 or True else jy)  # posicao ao longo do eixo y
            hits[-1] = ("v", jy)
        elif y1 == y2 == jy and min(x1, x2) <= jx <= max(x1, x2):
            hits.append(("h", jx))
    if not hits:
        return [seg], []

    pieces = []
    markers = []
    if x1 == x2:  # segmento vertical
        ys = sorted(h[1] for h in hits)
        cur = min(y1, y2)
        top = max(y1, y2)
        for jy in ys:
            pieces.append(((x1, cur), (x1, max(cur, jy - GAP/2))))
            cur = min(top, jy + GAP/2)
            markers.append((x1, jy))
        pieces.append(((x1, cur), (x1, top)))
        if y1 > y2:  # preserva sentido original nao importa p/ desenho
            pass
    else:  # horizontal
        xs = sorted(h[1] for h in hits)
        cur = min(x1, x2)
        right = max(x1, x2)
        for jx in xs:
            pieces.append(((cur, y1), (max(cur, jx - GAP/2), y1)))
            cur = min(right, jx + GAP/2)
            markers.append((jx, y1))
        pieces.append(((cur, y1), (right, y1)))

    pieces = [(a, b) for a, b in pieces if a != b]
    return pieces, markers

def render(mirrored: bool):
    parts = []
    tx = mirror_x if mirrored else (lambda x: x)

    # Contorno da placa -- referencia de escala e guia de corte do cobre virgem.
    bx = tx(BOARD_X) if not mirrored else tx(BOARD_X + BOARD_W)
    parts.append(f'<rect x="{min(tx(BOARD_X), tx(BOARD_X+BOARD_W)):.2f}" y="{BOARD_Y:.2f}" width="{BOARD_W:.2f}" height="{BOARD_H:.2f}" fill="none" stroke="#000" stroke-width="0.3" stroke-dasharray="1.5 1"/>')

    def line(x1, y1, x2, y2, w):
        parts.append(f'<line x1="{tx(x1):.2f}" y1="{y1:.2f}" x2="{tx(x2):.2f}" y2="{y2:.2f}" stroke="#000" stroke-width="{w}" stroke-linecap="round"/>')

    def pad(x, y):
        parts.append(f'<circle cx="{tx(x):.2f}" cy="{y:.2f}" r="{PAD_R}" fill="#000"/>')
        parts.append(f'<circle cx="{tx(x):.2f}" cy="{y:.2f}" r="{DRILL_R}" fill="#fff"/>')

    jump_markers = []
    for name, segs in R.NETS.items():
        w = seg_width(name)
        for seg in segs:
            pieces, jpts = split_for_jumpers(name, seg)
            for a, b in pieces:
                if a != b:
                    line(a[0], a[1], b[0], b[1], w)
            jump_markers.extend(jpts)

    # pads em cada ponto nomeado (menos os que sao so waypoints de roteamento)
    for label, (x, y) in R.PADS.items():
        pad(x, y)

    if mirrored:
        for (jx, jy) in jump_markers:
            parts.append(f'<circle cx="{tx(jx):.2f}" cy="{jy:.2f}" r="0.35" fill="none" stroke="#000" stroke-width="0.25" stroke-dasharray="0.3 0.3"/>')

    return "\n".join(parts)


if __name__ == "__main__":
    print("=== MIRRORED (impressão / transferência) ===")
    print(render(True))
    print("\n=== TOP (referência, não espelhado) ===")
    print(render(False))
