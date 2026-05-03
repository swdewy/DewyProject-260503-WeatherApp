# YouYou Weather

정적 HTML/CSS/JS 날씨 앱입니다. GitHub Pages에는 이 폴더 내용 그대로(또는 `docs/`에 복사) 올리면 됩니다.

## OpenWeather 키

1. [OpenWeather](https://openweathermap.org/)에서 무료 API 키를 발급합니다.
2. `app.js` 맨 위 `API_KEY`에 키 문자열을 넣고 저장합니다.
3. 브라우저에서 `index.html`을 열면 됩니다 (`file://`로 열어도 동작은 하지만 CORS 없이 브라우저에서 직접 열어도 OWM은 보통 허용됩니다).

## 파일 구조

- `index.html` — 페이지 골격
- `styles.css` — 명세 컬러·레이아웃·전환 효과
- `app.js` — 도시별 API 호출, 캐릭터 우선순위, 로컬 스토리지
- `assets/` — YouYou 누끼 PNG 캐릭터 (`YouYou_*.png`)

## 로컬 스토리지

키: `youyou-weather-prefs` — 마지막 도시 및 최근 도시 목록(최대 5개)이 저장됩니다.
