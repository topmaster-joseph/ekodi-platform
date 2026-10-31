#!/usr/bin/env python3
"""Generate the 목포노회 public pilot pages (static, no scripts, no personal data).

Run: python3 scripts/build-mokpo-presbytery-pages.py
Writes sites/mokpo-presbytery/index.html and sites/mokpo-presbytery/mission/index.html.
Church names come from sites/mokpo-presbytery/data/churches.json (names only).
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'sites' / 'mokpo-presbytery'
E = html.escape

CSS = """
:root{--ink:#13232b;--sea:#1d4b57;--sea-2:#2c6474;--brass:#9a7434;--paper:#f4f6f4;--card:#fff;--line:#dce2df;--muted:#56656b;--soft:#e9efed}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 "Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;word-break:keep-all}
a{color:var(--sea)}a:focus-visible,summary:focus-visible{outline:2px solid var(--brass);outline-offset:3px}
.wrap{max-width:1120px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.pilot{background:var(--ink);color:#d9e2e0;font-size:12.5px;letter-spacing:.02em}.pilot .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-block:7px}
.pilot b{color:#fff;font-weight:600}
header.top{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--ink)}
.mark{width:34px;height:34px;border:1.5px solid var(--sea);border-radius:50%;display:grid;place-items:center;flex:none}
.mark i{display:block;width:2px;height:18px;background:var(--sea);position:relative}.mark i:after{content:"";position:absolute;left:-6px;top:5px;width:14px;height:2px;background:var(--sea)}
.brand small{display:block;font-size:11.5px;color:var(--muted);letter-spacing:.04em}.brand strong{display:block;font:700 18px/1.25 "Noto Serif KR","Nanum Myeongjo","AppleMyungjo",serif;letter-spacing:-.01em}
nav.menu{display:flex;gap:2px;flex-wrap:wrap;justify-content:flex-end}
nav.menu a{padding:8px 11px;border-radius:7px;color:var(--ink);text-decoration:none;font-size:14.5px}
nav.menu a:hover{background:var(--soft)}nav.menu a.cta{background:var(--sea);color:#fff}nav.menu a.cta:hover{background:var(--sea-2)}
details.mnav{display:none}details.mnav summary{list-style:none;cursor:pointer;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:14px}
details.mnav summary::-webkit-details-marker{display:none}
details.mnav[open] nav{display:grid;position:absolute;left:0;right:0;top:100%;background:var(--card);border-bottom:1px solid var(--line);padding:8px max(20px,env(safe-area-inset-left,0px)) 14px;gap:2px}
details.mnav nav a{padding:11px 4px;border-bottom:1px solid var(--soft);color:var(--ink);text-decoration:none}
.hero{background:linear-gradient(180deg,#fff 0%,var(--paper) 100%);border-bottom:1px solid var(--line)}
.hero .wrap{padding-block:64px 52px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:48px;align-items:end}
.kicker{font-size:12.5px;letter-spacing:.14em;color:var(--brass);font-weight:700;text-transform:uppercase}
.hero h1{font:700 clamp(30px,4.6vw,50px)/1.22 "Noto Serif KR","Nanum Myeongjo","AppleMyungjo",serif;letter-spacing:-.02em;margin:14px 0 14px;text-wrap:balance}
.hero p.lead{margin:0;color:var(--muted);font-size:17px;max-width:38em}
.verse{margin-top:22px;padding-left:14px;border-left:3px solid var(--brass);color:var(--muted);font-size:14px}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden}
.facts div{padding:16px 18px;border-bottom:1px solid var(--line)}.facts div:nth-child(odd){border-right:1px solid var(--line)}
.facts div:nth-last-child(-n+2){border-bottom:0}.facts dt{font-size:12px;color:var(--muted);letter-spacing:.04em}.facts dd{margin:3px 0 0;font-weight:700;font-size:17px;font-variant-numeric:tabular-nums}
main section{padding-block:56px;border-bottom:1px solid var(--line)}main section:last-child{border-bottom:0}
.sh{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px;flex-wrap:wrap}
.sh h2{font:700 clamp(23px,3vw,30px)/1.3 "Noto Serif KR","Nanum Myeongjo","AppleMyungjo",serif;margin:4px 0 0;letter-spacing:-.015em}
.sh p{margin:0;color:var(--muted);max-width:36em;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px}
.grid.five{grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 20px 18px;display:flex;flex-direction:column;gap:6px;min-width:0}
.card h3{margin:0;font-size:17px}.card p{margin:0;color:var(--muted);font-size:14.5px}.card .meta{margin-top:auto;padding-top:10px;font-size:13px;color:var(--muted)}
a.card{text-decoration:none;color:var(--ink);transition:border-color .15s,transform .15s}a.card:hover{border-color:var(--sea);transform:translateY(-1px)}
a.card .go{margin-top:auto;padding-top:10px;color:var(--sea);font-weight:600;font-size:14px}
.pill{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.03em;padding:2px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted);background:var(--paper);width:fit-content}
.pill.on{color:#fff;background:var(--sea);border-color:var(--sea)}.pill.lock{color:var(--brass);border-color:#e3d3b4;background:#fbf7ef}
.card.locked{background:repeating-linear-gradient(135deg,#fff 0 12px,#fafbfa 12px 24px)}
.churches{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;align-items:start}
.churches details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:0}
.churches summary{cursor:pointer;padding:15px 18px;font-weight:700;display:flex;justify-content:space-between;gap:10px}
.churches summary span{color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.churches ul{list-style:none;margin:0;padding:4px 18px 16px;columns:2;column-gap:18px;font-size:14px;color:var(--ink)}.churches li{padding:3px 0;break-inside:avoid}
.timeline{display:grid;gap:0;border-left:2px solid var(--line);margin-left:8px}
.timeline div{position:relative;padding:4px 0 22px 22px}.timeline div:before{content:"";position:absolute;left:-7px;top:10px;width:12px;height:12px;border-radius:50%;background:var(--card);border:2px solid var(--sea)}
.timeline div.next:before{border-color:var(--line)}.timeline b{display:block}.timeline span{color:var(--muted);font-size:14px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:15px}
.tbl{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
th,td{padding:13px 16px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{font-size:12.5px;color:var(--muted);font-weight:600;letter-spacing:.03em}
td.n,th.n{text-align:right;white-space:nowrap}tfoot th,tfoot td{border-bottom:0;font-weight:700;color:var(--ink);font-size:15px}
.bar{height:8px;border-radius:99px;background:var(--soft);min-width:90px}.bar i{display:block;height:100%;border-radius:99px;background:var(--sea)}
.note{font-size:13.5px;color:var(--muted);margin-top:12px}
footer.foot{background:var(--ink);color:#c9d4d2;font-size:13.5px}footer.foot .wrap{padding-block:34px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
footer.foot b{color:#fff}footer.foot a{color:#e6ece9}
@media(max-width:900px){nav.menu{display:none}details.mnav{display:block}header.top .wrap{position:relative}.hero .wrap{grid-template-columns:minmax(0,1fr);padding-block:44px 38px;gap:30px}}
@media(max-width:520px){.churches ul{columns:1}main section{padding-block:42px}}
@media(prefers-reduced-motion:reduce){a.card{transition:none}}
"""


def chrome(title, desc, brand_small, brand, nav, body, base):
    links = ''.join(f'<a href="{E(h)}"{(" class=" + chr(34) + "cta" + chr(34)) if cta else ""}>{E(t)}</a>' for t, h, cta in nav)
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="description" content="{E(desc)}"><title>{E(title)}</title><style>{CSS}</style></head><body>
<div class="pilot"><div class="wrap"><span><b>EKODI 기반 목포노회 업무지원 시범 공간</b> · 공식 노회 홈페이지가 아닙니다</span><span>공식 소식: <a href="http://cafe.daum.net/pckmp" style="color:#fff" rel="noopener">목포노회 카페</a></span></div></div>
<header class="top"><div class="wrap"><a class="brand" href="{E(base)}"><span class="mark" aria-hidden="true"><i></i></span><span><small>{E(brand_small)}</small><strong>{E(brand)}</strong></span></a>
<nav class="menu" aria-label="주 메뉴">{links}</nav>
<details class="mnav"><summary aria-label="메뉴 열기">메뉴</summary><nav aria-label="모바일 메뉴">{links}</nav></details></div></header>
{body}
<footer class="foot"><div class="wrap"><div><b>대한예수교장로회 목포노회</b><br>EKODI 기반 업무지원 시범 공간 · 노회의 공식 운영 승인 전까지 시범 운영합니다.<br>회원 개인정보와 내부 문서는 이 공개 화면에 게시하지 않습니다.</div><div>© 2026 EKODI · <a href="https://ekodi.kr/">ekodi.kr</a></div></div></footer>
</body></html>
'''


def home():
    churches = json.loads((SITE / 'data' / 'churches.json').read_text(encoding='utf-8'))
    order = ['목포', '목포동', '신안', '신안동부', '함무', '미확인']
    total = sum(len(v) for v in churches.values())
    sichal = [
        ('목포시찰', '목포', '장로회원 21명', None),
        ('목포동시찰', '목포동', '장로회원 26명', None),
        ('신안시찰', '신안', '장로회원 19명', None),
        ('신안동부시찰', '신안동부', '장로회원 15명', None),
        ('함무시찰', '함무', '장로회원 19명', '/hammu/'),
    ]
    sc_cards = ''
    for name, key, meta, href in sichal:
        n = len(churches.get(key, []))
        if href:
            sc_cards += f'<a class="card" href="{href}"><span class="pill on">운영 중</span><h3>{E(name)}</h3><p>시찰회 공지·임원·회계보고·출석을 운영합니다.</p><span class="meta">{E(meta)} · 확인된 교회 {n}곳</span><span class="go">함무시찰회 바로가기 →</span></a>'
        else:
            sc_cards += f'<div class="card"><span class="pill">공간 준비 중</span><h3>{E(name)}</h3><p>같은 엔진으로 독립 공간을 열 수 있습니다.</p><span class="meta">{E(meta)} · 확인된 교회 {n}곳</span></div>'
    depts = (
        '<a class="card" href="/mokpo-presbytery/mission/"><span class="pill on">운영 중</span><h3>선교부</h3><p>2027 사업계획과 예산(안), 회의·자료, 부원 업무공간.</p><span class="meta">부장 김찬구 목사 · 서기 정찬균 목사</span><span class="go">선교부 바로가기 →</span></a>'
        + ''.join(f'<div class="card"><span class="pill">준비 중</span><h3>{E(n)}</h3><p>{E(d)}</p></div>' for n, d in [
            ('고시위원회', '노회 보고서 위원회 보고 항목'),
            ('동반목회지원위원회', '노회 보고서 위원회 보고 항목'),
            ('노회기금관리위원회', '노회 보고서 위원회 보고 항목'),
            ('여성위원회', '노회 보고서 위원회 보고 항목'),
            ('노회역사위원회', '노회 보고서 위원회 보고 항목'),
            ('노회훈련원 · 성서신학원', '교육 기관 보고 항목'),
        ])
    )
    groups = ''
    for key in order:
        names = churches.get(key, [])
        if not names:
            continue
        label = f'{key}시찰' if key != '미확인' else '시찰 확인 중'
        groups += f'<details{" open" if key == "함무" else ""}><summary>{E(label)}<span>{len(names)}곳</span></summary><ul>' + ''.join(f'<li>{E(c)}교회</li>' if not c.endswith('교회') else f'<li>{E(c)}</li>' for c in names) + '</ul></details>'
    body = f'''<section class="hero"><div class="wrap"><div><span class="kicker">The Presbytery of Mokpo · 135th Session</span>
<h1>생명의 하나님,<br>우리를 하나 되게 하소서</h1>
<p class="lead">노회와 시찰회, 부서와 교회가 한 공간에서 소식과 일정, 자료와 업무를 나눕니다. 공개 정보는 누구나 보고, 내부 업무는 권한을 받은 분만 다룹니다.</p>
<p class="verse">신명기 30:19–20 · 에베소서 4:1–6 — 제135회 정기회 주제</p></div>
<dl class="facts"><div><dt>제135회 정기회</dt><dd>2026. 10. 20.(화)</dd></div><div><dt>장소</dt><dd>양동제일교회당</dd></div><div><dt>목사회원</dt><dd>141명</dd></div><div><dt>장로회원</dt><dd>100명</dd></div><div><dt>시찰회</dt><dd>5개</dd></div><div><dt>회원명부 기준 교회</dt><dd>{total}곳</dd></div></dl></div></section>
<main>
<section id="about"><div class="wrap"><div class="sh"><div><span class="kicker">노회 소개</span><h2>함께 섬기는 목포노회</h2></div><p>대한예수교장로회 목포노회는 목포와 무안·신안·함평·진도 일대 교회가 함께하는 노회입니다. 이 공간은 노회 업무를 돕는 시범 서비스입니다.</p></div>
<div class="grid"><div class="card"><h3>정기회</h3><p>제135회 정기회를 2026년 10월 20일 양동제일교회당에서 열었습니다.</p></div><div class="card"><h3>공식 소식처</h3><p>노회의 공식 공지는 <a href="http://cafe.daum.net/pckmp" rel="noopener">목포노회 카페</a>, 총회 소식은 <a href="https://www.pck.or.kr/" rel="noopener">총회 홈페이지</a>를 기준으로 합니다.</p></div><div class="card"><h3>시범 운영 원칙</h3><p>노회의 공식 승인 전까지 공개 정보만 게시합니다. 회원명부와 회계 증빙은 공개하지 않습니다.</p></div></div></div></section>
<section id="news"><div class="wrap"><div class="sh"><div><span class="kicker">소식 · 공지</span><h2>노회 소식</h2></div><p>시찰회·부서 공지는 각 공간에서 관리하며, 공식 공지는 원문 출처로 연결합니다.</p></div>
<div class="grid"><a class="card" href="http://cafe.daum.net/pckmp" rel="noopener"><span class="pill">공식 출처</span><h3>목포노회 카페</h3><p>노회 공식 공지와 행정 안내</p><span class="go">원문 보기 →</span></a><a class="card" href="https://www.pck.or.kr/" rel="noopener"><span class="pill">공식 출처</span><h3>대한예수교장로회 총회</h3><p>총회 행정·교육·선교 안내</p><span class="go">원문 보기 →</span></a><a class="card" href="/hammu/"><span class="pill on">시찰회</span><h3>함무시찰회 공지</h3><p>시찰회가 직접 등록·관리하는 공지</p><span class="go">공지 보기 →</span></a></div></div></section>
<section id="sichal"><div class="wrap"><div class="sh"><div><span class="kicker">시찰회</span><h2>다섯 시찰회</h2></div><p>시찰회마다 같은 엔진 위에 독립 공간을 두고, 임원·공지·회계·출석을 각자 관리합니다.</p></div><div class="grid five">{sc_cards}</div></div></section>
<section id="departments"><div class="wrap"><div class="sh"><div><span class="kicker">부서 · 위원회</span><h2>부서와 위원회</h2></div><p>선교부가 첫 번째로 업무공간을 엽니다. 다른 부서와 위원회는 같은 방식으로 이어서 열 수 있습니다.</p></div><div class="grid">{depts}</div></div></section>
<section id="churches"><div class="wrap"><div class="sh"><div><span class="kicker">소속 교회</span><h2>함께하는 교회</h2></div><p>제135회 정기회 회원명부에 나타난 교회 이름입니다. 시찰 구분은 장로회원 기재 기준이며, 확인되지 않은 교회는 따로 모았습니다.</p></div><div class="churches">{groups}</div><p class="note">교회 이름만 게시하며 주소·연락처는 게시하지 않습니다. 누락·오기는 노회 서기에게 알려 주십시오.</p></div></section>
<section id="schedule"><div class="wrap"><div class="sh"><div><span class="kicker">회의 · 일정</span><h2>노회 일정</h2></div><p>확정된 일정만 게시합니다.</p></div>
<div class="timeline"><div><b>2026. 10. 20.(화) 제135회 정기회</b><span>양동제일교회당</span></div><div class="next"><b>다음 정기회</b><span>일정 확정 후 게시합니다.</span></div></div></div></section>
<section id="library"><div class="wrap"><div class="sh"><div><span class="kicker">자료실</span><h2>기준 자료</h2></div><p>공개 가능한 자료의 목록입니다. 원본 파일은 권한 확인 후 제공합니다.</p></div>
<div class="grid"><div class="card"><span class="pill">보고서</span><h3>제135회 정기회 보고서</h3><p>위원회·훈련원·유지재단·성서신학원·연합회·시찰회·재정부 보고, 노회 규칙 및 규정, 역대 임원 명단 수록</p><span class="meta">2026. 10. 20.</span></div><div class="card"><span class="pill">규정</span><h3>목포노회 규칙 및 규정</h3><p>정기회 보고서 수록본 기준</p></div></div></div></section>
<section id="workspace"><div class="wrap"><div class="sh"><div><span class="kicker">회원 업무공간</span><h2>권한을 받은 분의 업무공간</h2></div><p>EKODI 통합 로그인(Google)으로 들어가며, 공간마다 부여된 권한만큼만 열립니다.</p></div>
<div class="grid"><a class="card" href="/mokpo-presbytery/admin"><span class="pill on">로그인</span><h3>노회 운영관리</h3><p>노회 공지·임원·회계·출석 관리</p><span class="go">들어가기 →</span></a><a class="card" href="/mokpo-presbytery/mission/admin"><span class="pill on">로그인</span><h3>선교부 운영관리</h3><p>선교부 임원·공지·회계·출석 관리</p><span class="go">들어가기 →</span></a><div class="card locked" aria-disabled="true"><span class="pill lock">잠금</span><h3>회원명단</h3><p>최고관리자와 사전에 지정된 명단 관리자만 열람합니다.</p><span class="meta">권한이 없는 계정에서는 선택할 수 없습니다.</span></div></div></div></section>
</main>'''
    nav = [('노회 소개', '#about', False), ('소식·공지', '#news', False), ('시찰회', '#sichal', False), ('부서·위원회', '#departments', False), ('소속 교회', '#churches', False), ('회의·일정', '#schedule', False), ('자료실', '#library', False), ('업무공간', '#workspace', True)]
    return chrome('목포노회 · EKODI 업무지원 시범 공간', '대한예수교장로회 목포노회 업무지원 시범 공간', '대한예수교장로회', '목포노회', nav, body, '/mokpo-presbytery/')


def mission():
    budget = [('정책협의회 및 세미나', 400000), ('전도목사 및 전도사역 지원', 900000), ('군선교 지원', 500000), ('농어촌·도서지역 교회 선교협력', 500000), ('선교부 전체모임', 400000), ('임원회의 및 운영비', 200000), ('예비비', 100000)]
    total = sum(v for _, v in budget)
    assert total == 3000000, total
    rows = ''.join(f'<tr><td>{E(n)}</td><td class="n">{v:,}원</td><td class="n">{v * 100 / total:.1f}%</td><td><div class="bar" aria-hidden="true"><i style="width:{v * 100 / max(x for _, x in budget):.1f}%"></i></div></td></tr>' for n, v in budget)
    body = f'''<section class="hero"><div class="wrap"><div><span class="kicker">Mission Department · 2026–2027</span>
<h1>함께 세우는 선교,<br>지역과 교회를 잇는 동행</h1>
<p class="lead">2026년 가을노회부터 2027년 가을노회까지 선교부의 사업과 예산, 회의와 기록을 한곳에서 나눕니다.</p>
<p class="verse">사업계획과 예산은 부원회의 심의 전 초안입니다.</p></div>
<dl class="facts"><div><dt>선교부장</dt><dd>김찬구 목사</dd></div><div><dt>소속</dt><dd>안좌대리교회</dd></div><div><dt>서기</dt><dd>정찬균 목사</dd></div><div><dt>소속</dt><dd>에코디교회</dd></div><div><dt>운영 기간</dt><dd>2026 가을–2027 가을</dd></div><div><dt>2027 예산(안)</dt><dd>3,000,000원</dd></div></dl></div></section>
<main>
<section id="intro"><div class="wrap"><div class="sh"><div><span class="kicker">소개 · 구성</span><h2>선교부는 이렇게 일합니다</h2></div><p>서기가 작성하고, 부장이 검토·승인하며, 부원은 허용된 자료를 보고 의견을 냅니다. 모든 변경은 기록으로 남습니다.</p></div>
<div class="grid"><div class="card"><span class="pill">1</span><h3>서기 작성</h3><p>사업계획·예산·회의록 초안을 작성하고 수정합니다.</p></div><div class="card"><span class="pill">2</span><h3>부장 검토 · 승인</h3><p>검토 후 승인하면 확정본이 됩니다.</p></div><div class="card"><span class="pill">3</span><h3>부원 열람 · 의견</h3><p>허용된 자료를 보고 의견을 남깁니다.</p></div><div class="card"><span class="pill">4</span><h3>감사 기록</h3><p>누가 언제 무엇을 바꿨는지 남습니다.</p></div></div></div></section>
<section id="plans"><div class="wrap"><div class="sh"><div><span class="kicker">2027 사업계획(안)</span><h2>네 갈래의 사업</h2></div><p>부원회의 심의 전 초안입니다.</p></div>
<div class="grid"><div class="card"><h3>선교정책 협력</h3><p>총회·노회 정책협의회 참여와 지역 선교 현안 검토</p></div><div class="card"><h3>전도 및 군선교</h3><p>전도사역 지원과 목포해군교회 협력</p></div><div class="card"><h3>농어촌·도서지역</h3><p>지역교회 필요 조사와 선교협력</p></div><div class="card"><h3>부원 교제 · 평가</h3><p>전체모임과 회의, 2027 가을노회 보고 준비</p></div></div></div></section>
<section id="budget"><div class="wrap"><div class="sh"><div><span class="kicker">예산 편성(안)</span><h2>2027 예산안 3,000,000원</h2></div><p>확정 예산이 아닌 심의용 편성안입니다. 집행 내역과 증빙은 업무공간에서만 다룹니다.</p></div>
<div class="tbl"><table><thead><tr><th scope="col">사업</th><th scope="col" class="n">금액</th><th scope="col" class="n">비율</th><th scope="col">배분</th></tr></thead><tbody>{rows}</tbody><tfoot><tr><th>합계</th><td class="n">{total:,}원</td><td class="n">100%</td><td></td></tr></tfoot></table></div>
<p class="note">2026년 결산과 2027년 예산은 회계연도별로 따로 관리합니다.</p></div></section>
<section id="meetings"><div class="wrap"><div class="sh"><div><span class="kicker">회의 · 일정</span><h2>회의와 일정</h2></div><p>확정된 일정만 게시합니다.</p></div>
<div class="timeline"><div><b>2026. 10. 20.(화) 제135회 정기회</b><span>선교부 구성 · 2026년 사업 보고</span></div><div class="next"><b>선교부 첫 회의</b><span>부원 협의 후 공지합니다.</span></div><div class="next"><b>2027 가을노회</b><span>2027년 사업 결과 보고</span></div></div></div></section>
<section id="resources"><div class="wrap"><div class="sh"><div><span class="kicker">회의록 · 공문 · 자료실</span><h2>기록과 자료</h2></div><p>공개 가능한 자료만 게시합니다. 회의록과 증빙은 권한자에게만 보입니다.</p></div>
<div class="grid"><div class="card"><span class="pill">기준 자료</span><h3>제135회 정기회 보고서</h3><p>선교부 사업·회계 보고의 기준 자료</p></div><div class="card locked"><span class="pill lock">권한 필요</span><h3>회의록 · 공문</h3><p>부원 업무공간에서 열람합니다.</p></div></div></div></section>
<section id="workspace"><div class="wrap"><div class="sh"><div><span class="kicker">부원 업무공간</span><h2>선교부 운영관리</h2></div><p>EKODI 통합 로그인(Google)으로 들어가며, 선교부 권한이 있는 분만 열립니다. 다른 부서·시찰회 데이터와 분리되어 있습니다.</p></div>
<div class="grid"><a class="card" href="/mokpo-presbytery/mission/admin"><span class="pill on">로그인</span><h3>운영 홈</h3><p>회기·임원·공지·감사기록 현황</p><span class="go">들어가기 →</span></a><a class="card" href="/mokpo-presbytery/mission/admin/finance"><span class="pill on">로그인</span><h3>회계보고</h3><p>수입·지출 기록과 공개 승인</p><span class="go">들어가기 →</span></a><a class="card" href="/mokpo-presbytery/mission/admin/officers"><span class="pill on">로그인</span><h3>임원</h3><p>부장·서기·회계</p><span class="go">들어가기 →</span></a></div></div></section>
</main>'''
    nav = [('노회 홈', '/mokpo-presbytery/', False), ('소개·구성', '#intro', False), ('사업계획', '#plans', False), ('예산', '#budget', False), ('회의·일정', '#meetings', False), ('자료실', '#resources', False), ('업무공간', '#workspace', True)]
    return chrome('선교부 · 목포노회', '목포노회 선교부 2027 사업계획 및 예산(안)', '목포노회', '선교부', nav, body, '/mokpo-presbytery/mission/')


if __name__ == '__main__':
    (SITE / 'index.html').write_text(home(), encoding='utf-8')
    (SITE / 'mission' / 'index.html').write_text(mission(), encoding='utf-8')
    print('wrote', SITE / 'index.html', SITE / 'mission' / 'index.html')
