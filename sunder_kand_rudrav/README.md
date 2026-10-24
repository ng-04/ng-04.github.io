# Sunderkand Path

A live reading page for a group Sunderkand path: Hanuman Chalisa, Sunderkand (Gita Press),
Shri Hanuman ji ki Aarti and Shri Ramayan ji ki Aarti. Everyone opens the same link on their
phone. The leader moves a pointer verse by verse, and every phone highlights and scrolls to
the current verse.

Live at **https://ng-04.github.io/sunder_kand_rudrav/**

## How it works

- Static files on GitHub Pages; no build step.
- The shared pointer is one Firebase Realtime Database node, `/live = { idx, at }`.
  Everyone can read it; only the leader's account can write it (`database.rules.json`).
- The leader PIN is the password of a single Firebase Auth user (`ADMIN_EMAIL` in
  `config.js`). The PIN is never stored in the code.
- If Firebase can't be reached, the full text still shows and the status says
  "Reading only".

| File | What it is |
|---|---|
| `index.html` | Page structure and styles |
| `app.js` | Rendering, follow mode, reading settings, leader mode, live sync |
| `config.js` | Firebase web config, `ADMIN_EMAIL`, `TOTAL` (660) |
| `verses.json` | All 660 verses in recitation order (Hindi, Roman, meaning) |
| `story.json` | `[startIndex, text]` story lines |
| `database.rules.json` | Realtime Database rules (paste into the Firebase console) |

## Running a path

1. Open the link on your phone, tap **Aa → Lead**, enter the PIN.
2. Tap the **QR icon** in the top bar and show the code so everyone can join
   (it also has **Copy link** and, on phones, **Share…**).
3. Tap **Next** for each verse, or tap any verse to jump everyone there.
   On a laptop: arrow keys, space, PageUp and PageDown.
4. When you're done, **Aa → Stop leading** (or just close the page; the next path starts
   where this one ended until you reset).

Each Story box has a small line drawing of the scene (35 scenes, drawn as SVG symbols at
the top of `index.html`; `SCENES` in `app.js` says which story lines use which scene).

Viewers can turn Hindi, Roman, Story, Meaning and Pictures on or off and change the text size from
**Aa**. If they scroll away, **↓ Back to live verse** brings them back.

## Finding a verse

Tap the search icon (or press `/` on a laptop) and type a number:

| Type | Finds |
|---|---|
| `12.4` | Sunderkand chaupai 12.4 |
| `12` | Sunderkand doha 12, its chaupais 12.1–12.x, Chalisa chaupai 12, Aarti line 12 |
| `doha 12`, `d12`, `39क`, `39k` | That Sunderkand doha only |
| `shlok 2`, `chhand 3.1` | Opening shlok 2, chhand 1 after doha 3 |
| `chalisa 7`, `aarti 3`, `ramayan aarti 2` | Hanuman Chalisa or Aarti lines |
| a few words, e.g. `pavan tanay` or `बिद्यावान` | Verses containing them |

Devanagari digits (`१२.४`) work too. Tapping a result scrolls there; it does not move the
live verse for others. The leader can then tap the verse to move everyone.

## Resetting to the start

**Aa → Back to start → Yes, start over** moves everyone to the first verse.

## Changing the PIN

The leader email is made up, so Firebase's "Reset password" email can't be used. Instead:

1. Firebase console → Authentication → Users → delete the leader user.
2. **Add user** with the same email and the new PIN (at least 6 characters).
3. The new user has a new UID: put it in the rules (Realtime Database → Rules) and **Publish**.

Devices signed in with the old PIN are signed out.

## Adding a co-leader

- **Simplest:** share the PIN with them.
- **Their own PIN:** in Authentication add a second user (e.g. `coleader@sunderkand-path.com`
  with its own PIN), then:
  1. In `config.js`, make `ADMIN_EMAIL` a list: `['leader@sunderkand-path.com', 'coleader@sunderkand-path.com']`.
  2. In the rules, allow both UIDs and publish:
     `".write": "auth != null && (auth.uid === 'UID_ONE' || auth.uid === 'UID_TWO')"`

## Local preview

From the repo root: `python3 -m http.server 8000`, then open
http://localhost:8000/sunder_kand_rudrav/. For leading to work from localhost,
`localhost` must be in Firebase Authentication → Settings → Authorized domains (it is by
default).
