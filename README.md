# 📄 `README.md` — Complete FareFlow Documentation
<h1 align="center">
  <br>
  🚌 FareFlow
  <br>
</h1>

<h3 align="center">
  Fleet • Fare • Finance Manager
</h3>

<p align="center">
  A modern, offline-ready web app for managing fleet operations, fare collection, batch-wise attendance, and daily trip finances — all in one elegant place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-brightgreen" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/PWA-ready-success" alt="PWA" />
  <img src="https://img.shields.io/badge/semantic-HTML5-orange" alt="Semantic HTML5" />
  <img src="https://img.shields.io/badge/theme-dark%20%7C%20light%20%7C%20system-9cf" alt="Theme" />
  <img src="https://img.shields.io/badge/made%20with-%E2%9D%A4%20in%20Pakistan-red" alt="Made in Pakistan" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Screens & Workflow](#-screens--workflow)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Firebase Setup](#-firebase-setup)
- [Firestore Rules](#-firestore-rules)
- [Deployment](#-deployment)
- [How to Use](#-how-to-use)
- [Admin System](#-admin-system)
- [Data Model](#-data-model)
- [PWA Installation](#-pwa-installation)
- [Customization](#-customization)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Credits](#-credits)

---

## 🌟 Overview

**FareFlow** is a modern, glassmorphic, golden-themed web application built for fleet owners, transporters, and transport managers who need a clean way to manage daily operations.

From arranging vehicles, marking attendance, collecting fares, and tracking per-vehicle expenses — to viewing live summaries, saving trips, and analyzing history — FareFlow handles it all in a fast, mobile-first, offline-capable interface.

It comes with:

- 🎨 A beautiful **golden glassmorphism** design
- 🚌 A cinematic **3D animated background** featuring a bus on a futuristic highway
- 🔐 **Admin approval system** with super-admin gating
- 📲 Full **Progressive Web App** support — installable on any device
- 🌗 **Dark, Light, and System** themes
- ♿ Fully **semantic HTML5** for accessibility
- ⚡ **Zero-build-step deployment** — just HTML, CSS, and JavaScript

---

## ✨ Features

### 🚐 Fleet & Vehicle Management

- Add, remove, and manage unlimited vehicle types (Bus, Mini Bus, Coaster, Van, Carry, Hiace, etc.)
- Per-trip **vehicle count stepper** with `−` and `+` buttons (no keyboard popup on mobile)
- Each vehicle instance is auto-labeled (`Van 1`, `Van 2`, `Bus 1`, etc.)
- Assign passengers to specific vehicle instances

### 👦 Passenger Management (Boys)

- **Master list** — Add boys once with name + batch, reuse every trip
- **Attendance tracking** — Mark present/absent per trip
- **Fare entry** — Individual fare input per passenger
- **Bulk actions** — Select multiple boys and:
  - Apply same fare to all
  - Mark all absent
  - Mark all present
- **Smart filters**:
  - **All** — Everyone
  - **By Batch** — Filter by 24, 25, 26, etc.
  - **Present** — Only those who paid (fare > 0)
  - **Absent** — Only those absent or unpaid
  - **Not Paid** — Only those present but fare = 0

### 👧 Girls (Group Entry)

- Enter **count** and **fare per girl**
- Auto-computed total
- Auto-synced to summary

### 💰 Expense Tracking

- **Per-vehicle expenses** — Each vehicle has its own Toll + Driver cost row
- **"Free" toggle** — Mark a vehicle as free (no toll/driver)
- **Live totals** — Aggregated as you type

### 📊 Live Summary

Real-time dashboard that shows:

- Present Boys count
- Absent Boys count
- Boys Collected
- Girls Collected
- Total Fare
- Toll (–)
- Driver Cost (–)
- **Net Balance** (with green/red indicator)

### 📝 Today's Entry Persistence

Save today's trip once. Refresh the page. **Everything comes back.** Update fares, mark absent → present, add partial payments — all in real time without creating duplicates.

### 📚 History

- View saved trips (auto-cleanup after **3 months**)
- **Bulk delete** with multi-select
- **Refresh button**
- **TODAY** badge on today's entry
- Trip details modal with:
  - Vehicles arranged
  - Boys grouped by vehicle
  - Per-vehicle expenses
  - Girls breakdown
  - Financial summary

### 👑 Admin System

- **Super admin** auto-granted on first login
- **Pending approval** for all other users
- **Create Admins tab** — Grant or revoke access
- Protection: Last admin cannot be removed; self-revoke blocked

### 🎨 Design & UX

- **Golden glassmorphism** theme
- **Sliding gold indicator** on tabs (main + sub-tabs)
- **Sparkle effect** on Sign In / Create Account buttons
- **7-second cooldown** to prevent spam
- **Boot loader** with progress bar (0 → 100%)
- **Skeleton screen** during app startup
- **Toast notifications** — theme-aware
- **Custom scrollbars** — theme-aware
- **System theme detection** (dark / light / system)
- **Fully responsive** — mobile, tablet, desktop, large desktop
- **`prefers-reduced-motion`** respected

### 🚌 Cinematic 3D Background

An immersive Three.js scene that runs behind the entire app:

- **"24 EXPRESS" bus** with detailed procedural model
- Rotating wheels, suspension bounce, realistic headlight beam
- **Blurry immersive headlights** in dark mode
- **Realistic grass and trees** in light mode
- Twinkling star field + occasional shooting stars
- **Golden grid highway** scrolling toward the camera
- Distant futuristic city skyline with emissive windows
- Roadside light poles with glow
- **Chase camera** with mouse/gyro parallax

### 📲 Progressive Web App

- **Installable** on Android, iOS, Windows, macOS
- **Offline caching** via Service Worker
- **Shortcuts** for New Entry and History
- **Standalone mode** — Looks like a native app
- **Auto-updates** on new deploys

### 🔐 Security & Data

- **Firebase Authentication** (Email/Password)
- **Cloud Firestore** for storage
- **Offline persistence** — Works without internet
- **Strict Firestore security rules**
- **Per-user data isolation**

---

## 🖼 Screens & Workflow

### Login

Clean, centered, glassmorphic login form with animated golden brand.

### Pending View

A calm, welcoming screen for users awaiting admin approval.

### Entry Tab (5 Sub-tabs)

| #   | Sub-tab             | Purpose                                          |
| --- | ------------------- | ------------------------------------------------ |
| 1   | **Date & Vehicles** | Pick trip date, arrange vehicle counts           |
| 2   | **Boys**            | Attendance + fare per boy, bulk actions, filters |
| 3   | **Girls**           | Girls count + fare per girl + auto total         |
| 4   | **Expenses**        | Per-vehicle toll + driver cost, free toggle      |
| 5   | **Summary**         | Real-time financial overview + Save              |

### History Tab

List of saved trips with search, bulk delete, refresh, and today's badge.

### Settings Tab (4 Sub-tabs)

| #   | Sub-tab           | Purpose                            |
| --- | ----------------- | ---------------------------------- |
| 1   | **Vehicles**      | Manage vehicle types               |
| 2   | **Batches**       | Manage batch numbers (24, 25, 26…) |
| 3   | **Boys List**     | Master list — add/edit/remove boys |
| 4   | **Create Admins** | Grant/revoke admin access          |

---

## 🛠 Tech Stack

| Layer         | Technology                                                   |
| ------------- | ------------------------------------------------------------ |
| **Markup**    | Semantic HTML5                                               |
| **Styling**   | Modern CSS (Grid, Flexbox, custom properties, glassmorphism) |
| **Logic**     | Vanilla JavaScript (ES2020+)                                 |
| **Auth**      | Firebase Authentication (compat SDK)                         |
| **Database**  | Cloud Firestore                                              |
| **Analytics** | Firebase Analytics (optional)                                |
| **3D**        | Three.js r128 (CDN)                                          |
| **Fonts**     | Google Fonts (Cinzel + Inter)                                |
| **Hosting**   | Cloudflare Pages (recommended) / any static host             |
| **PWA**       | Custom `manifest.json` + `sw.js`                             |

**Zero build step. Zero dependencies to install. Just deploy.**

---

## 📂 Project Structure
```

Fare-App/
├── index.html # Semantic HTML5 markup
├── style.css # Complete styling (glassmorphism + responsive)
├── app.js # Main application logic
├── firebase.js # Firebase config + Firestore helpers
├── three-bg.js # Cinematic 3D background (Three.js)
├── sw.js # Service Worker (offline + caching)
├── manifest.json # PWA manifest
├── icon-192.png # PWA icon (192×192)
├── icon-512.png # PWA icon (512×512)
├── firestore.rules # Firestore security rules (reference)
└── README.md # You are here

````

---

## 🚀 Getting Started

### Prerequisites

- A [Firebase](https://console.firebase.google.com) account (free tier is fine)
- A [Cloudflare](https://dash.cloudflare.com) account (for hosting) **or** any static hosting
- A GitHub account (for auto-deployment)

### 1. Clone the Repository

```bash
git clone https://github.com/FidaHussain3432/Fare-App.git
cd Fare-App
````

### 2. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** → give it a name (e.g., `fare-app-24`)
3. Disable Google Analytics (or enable — your choice)
4. After project creation, click the **`</>`** icon to add a **Web App**
5. Copy the config object

### 3. Update Firebase Config

Open `firebase.js` and replace the `firebaseConfig` object with your own:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID", // optional
};
```

### 4. Enable Firebase Services

In the Firebase Console:

- **Authentication** → Sign-in method → Enable **Email/Password**
- **Firestore Database** → Create database → Start in **Production Mode**

### 5. Set Your Super Admin Email

Open `firebase.js` and update:

```javascript
const SUPER_ADMIN_EMAILS = [
  "your-email@example.com", // ⚠️ Replace with your email
];
```

This email will **automatically become admin** on first login.

### 6. Deploy

See the [Deployment](#-deployment) section below.

---

## 🔥 Firebase Setup

### Environment Checklist

| Service        | Required?   | Purpose                             |
| -------------- | ----------- | ----------------------------------- |
| Authentication | ✅ Yes      | Login / Sign up                     |
| Firestore      | ✅ Yes      | Store configs, trips, users, admins |
| Analytics      | ⚙️ Optional | Usage stats                         |
| Storage        | ❌ No       | Not used                            |

### Collections Used

- `users` — Registered users
- `admins` — Admin access records
- `configs` — Per-user vehicles, batches, boys
- `trips` — Trip entries

Firestore creates them automatically on first write.

---

## 🔐 Firestore Rules

Paste these rules in **Firestore → Rules** tab and click **Publish**:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    /* ---------- HELPERS ---------- */
    function isSignedIn() {
      return request.auth != null;
    }

    function uid() {
      return request.auth.uid;
    }

    function email() {
      return request.auth.token.email != null
             ? request.auth.token.email.lower()
             : '';
    }

    function isAdmin() {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/admins/$(uid()));
    }

    function isSuperAdmin() {
      return isSignedIn() && email() == 'your-email@example.com';
    }

    /* ---------- USERS ---------- */
    match /users/{userId} {
      allow read: if isSignedIn() && (uid() == userId || isAdmin());
      allow create: if isSignedIn() && uid() == userId;
      allow update: if isSignedIn() && uid() == userId
                    && request.resource.data.uid == userId;
      allow delete: if isAdmin();
    }

    /* ---------- ADMINS ---------- */
    match /admins/{adminId} {
      allow read: if isSignedIn();

      allow create: if isSignedIn()
                    && adminId == uid()
                    && (isAdmin() || isSuperAdmin());

      allow create: if isSignedIn() && isAdmin();

      allow update: if isSignedIn() && isAdmin();

      allow delete: if isSignedIn() && isAdmin();
    }

    /* ---------- CONFIGS ---------- */
    match /configs/{userId} {
      allow read: if isSignedIn() && (uid() == userId || isAdmin());
      allow create, update: if isSignedIn() && (uid() == userId || isAdmin());
      allow delete: if isSignedIn() && isAdmin();
    }

    /* ---------- TRIPS ---------- */
    match /trips/{tripId} {
      allow read: if isSignedIn() && (
        resource.data.uid == uid() || isAdmin()
      );

      allow create: if isSignedIn()
                    && request.resource.data.uid == uid();

      allow update: if isSignedIn() && (
        resource.data.uid == uid() || isAdmin()
      ) && request.resource.data.uid == resource.data.uid;

      allow delete: if isSignedIn() && (
        resource.data.uid == uid() || isAdmin()
      );
    }

    /* ---------- DENY EVERYTHING ELSE ---------- */
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

⚠️ **Important:** Replace `'your-email@example.com'` with your actual super admin email **in BOTH** `firebase.js` and `firestore.rules`.

---

## 🌐 Deployment

### Option 1: Cloudflare Pages (Recommended — Free)

1. Push the code to GitHub
2. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
3. Click **"Create application"** → **"Pages" tab** → **"Connect to Git"**
4. Authorize GitHub and select your repository
5. Configure:
   - **Framework preset:** `None`
   - **Build command:** _(leave empty)_
   - **Build output directory:** `/`
6. Click **"Save and Deploy"**
7. Your site goes live at `https://your-project.pages.dev`

Every `git push` auto-deploys.

### Option 2: GitHub Pages

1. Repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, Folder: `/ (root)`
4. Save → Site available at `https://username.github.io/Fare-App/`

### Option 3: Vercel / Netlify

- Both support static sites
- Just point to the repo, no build command needed, output `/`

### Option 4: Any Static Host

Upload all files to any web server. It's pure HTML/CSS/JS.

---

## 📘 How to Use

### 1. First-Time Setup (Super Admin)

1. Open the deployed site
2. Click **Create Account** and sign up with your super-admin email
3. You'll be **auto-granted admin** access
4. Go to **Settings → Vehicles** and add your vehicle types
5. Go to **Settings → Batches** and add batch numbers
6. Go to **Settings → Boys List** and add boys (name + batch)

### 2. Daily Workflow

1. **Entry → Date & Vehicles** — Pick today's date, set vehicle counts
2. **Entry → Boys** — Mark attendance, enter fares, use filters as needed
3. **Entry → Girls** — Enter girls count and fare per girl
4. **Entry → Expenses** — Enter per-vehicle toll and driver costs
5. **Entry → Summary** — Review the live summary
6. Click **💾 Save Trip**

You can come back anytime today — the form reloads with your saved data.

### 3. Managing Admins

1. Go to **Settings → Create Admins**
2. You'll see all registered users
3. Click **Make Admin** to grant access
4. Click **Revoke** to remove access (last admin is protected)

---

## 👑 Admin System

### Who Can Access the App?

Only **admins** can access the main app. Everyone else sees a **pending approval** view.

### How Do I Become Admin?

Two ways:

1. **You're on the super-admin list** → Auto-granted on login
2. **An existing admin grants you** → Via Settings → Create Admins

### Super Admin List

Edit `SUPER_ADMIN_EMAILS` in `firebase.js`:

```javascript
const SUPER_ADMIN_EMAILS = ["admin1@example.com", "admin2@example.com"];
```

These emails **automatically become admin** the first time they log in.

### Safety Mechanisms

- 🔒 **Cannot revoke self**
- 🔒 **Cannot revoke last admin**
- 🔒 **Bootstrap fallback** — If no admin exists, first user becomes admin
- 🔒 **Pending view** for everyone else

---

## 🗂 Data Model

### `users/{uid}`

```json
{
  "uid": "user_id",
  "email": "user@example.com",
  "displayName": "",
  "createdAt": "timestamp",
  "lastLogin": "timestamp"
}
```

### `admins/{uid}`

```json
{
  "uid": "user_id",
  "email": "user@example.com",
  "grantedAt": "timestamp",
  "grantedBy": "super-admin-list"
}
```

### `configs/{uid}`

```json
{
  "vehicles": ["Bus", "Van", "Coaster"],
  "batches": ["24", "25", "26"],
  "boys": [
    { "name": "Ali", "batch": "24" },
    { "name": "Bilal", "batch": "25" }
  ],
  "updatedAt": "timestamp"
}
```

### `trips/{uid_YYYY-MM-DD}` (Today)

```json
{
  "uid": "user_id",
  "date": "2026-10-15",
  "vehicles": { "Van": 2, "Bus": 1 },
  "boys": [
    {
      "name": "Ali",
      "batch": "24",
      "vehicle": "Van 1",
      "fare": 500,
      "absent": false
    }
  ],
  "expenses": {
    "Van 1": {
      "toll": 200,
      "driver": 800,
      "tollFree": false,
      "driverFree": false
    }
  },
  "girlsCount": 10,
  "girlsFarePer": 150,
  "girlsTotal": 1500,
  "boysTotal": 15000,
  "totalFare": 16500,
  "toll": 400,
  "driver": 1600,
  "net": 14500,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `trips/{auto-id}` (Past/Future)

Same schema but with auto-generated ID instead of deterministic.

---

## 📲 PWA Installation

### Android (Chrome / Edge / Samsung Internet)

1. Open the site
2. Tap the **"Install FareFlow"** banner (bottom of screen)
3. Or tap the menu → **"Install app"**
4. Confirm → App appears on home screen

### iOS (Safari)

1. Open the site in **Safari**
2. Tap the **Share** button (square with arrow)
3. Scroll down → **"Add to Home Screen"**
4. Name it and tap **Add**

### Desktop (Chrome / Edge)

1. Look for the **install icon** in the address bar
2. Or menu → **"Install FareFlow"**
3. App opens in its own window

### What Works Offline?

- ✅ App shell (HTML, CSS, JS)
- ✅ Previously loaded Firestore data (via persistence)
- ✅ New entries (synced when online)

### What Needs Internet?

- ⚠️ Login / Sign up
- ⚠️ Sync new trips
- ⚠️ Admin grant/revoke

---

## 🎨 Customization

### Change Brand Color

In `style.css`, modify the CSS variables at the top:

```css
:root {
  --gold-1: #f6d365;
  --gold-2: #d4a017;
  --amber: #ffb347;
}
```

### Change Bus Label

In `three-bg.js`, update the CONFIG:

```javascript
const CONFIG = {
  busLabel: "24 EXPRESS", // ← Change this
  cameraMode: "chase", // 'chase' | 'side' | 'cinematic'
};
```

### Change Default Vehicles / Batches

In `firebase.js`:

```javascript
const DEFAULT_VEHICLES = ["Bus", "Mini Bus", "Coaster Bus", "Van", "Carry"];
const DEFAULT_BATCHES = ["24", "25", "26"];
```

### Change Theme Colors (Light Mode)

In `style.css`:

```css
[data-theme="light"] {
  --bg-1: #faf6ec;
  --text: #2b2418;
  /* ... */
}
```

### Disable 3D Background

In `three-bg.js`, at the top of `initThree()`:

```javascript
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
```

Or simply remove the `<script src="three-bg.js"></script>` line from `index.html`.

---

## 🐛 Troubleshooting

### Login Fails with "Permission Denied"

**Cause:** Firestore rules not published.
**Fix:** Paste the rules in Firebase Console → Firestore → Rules → Publish.

### "Pending Approval" Forever

**Cause:** Super admin hasn't logged in yet.
**Fix:** Login with the super-admin email from `SUPER_ADMIN_EMAILS`.

### Blank Page After Login

**Cause:** Firebase config wrong or Firestore rules blocking.
**Fix:** Open browser console (`F12`), check for errors. Verify config in `firebase.js`.

### PWA Won't Install

**Cause:** Icons missing or manifest wrong.
**Fix:** Ensure `icon-192.png` and `icon-512.png` exist in the root. Check the manifest via DevTools → Application → Manifest.

### 3D Background Not Loading

**Cause:** Three.js CDN blocked or WebGL unsupported.
**Fix:** Check browser console. Try a different browser. Or remove `three-bg.js` script tag.

### Old Cache Showing

**Cause:** Service Worker serving stale files.
**Fix:**

- Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Or DevTools → Application → Service Workers → Unregister
- Or bump `CACHE_VERSION` in `sw.js`

### Trip Not Saving

**Cause:** Network issue or Firestore rules.
**Fix:** Check console. Verify you're logged in. Verify rules allow writes.

### "Last admin cannot be removed"

**Cause:** Safety mechanism.
**Fix:** Grant another admin first, then revoke the one you want to remove.

---

## 🗺 Roadmap

- [ ] GLTF bus model support (swap `createBus()` with real 3D model)
- [ ] Rain / weather modes for the 3D scene
- [ ] Multi-user shared trips
- [ ] Export to PDF / Excel
- [ ] Email notifications for pending approvals
- [ ] Push notifications for daily summary
- [ ] Analytics dashboard
- [ ] Bulk import boys from CSV
- [ ] Custom branding per admin
- [ ] Multi-language support (Urdu, English)

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repo
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines

- Keep PRs focused (one feature per PR)
- Follow existing code style
- Test on mobile + desktop
- Update README if needed

---

## 📄 License

This project is licensed under the **MIT License** — see below:

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 💛 Credits

- **Author:** Fida Hussain ([@FidaHussain3432](https://github.com/FidaHussain3432))
- **Design:** Glassmorphism + Golden Palette
- **Fonts:** [Cinzel](https://fonts.google.com/specimen/Cinzel) + [Inter](https://fonts.google.com/specimen/Inter) by Google Fonts
- **3D Engine:** [Three.js](https://threejs.org/) r128
- **Auth & Data:** [Firebase](https://firebase.google.com/)
- **Icons:** Native emoji

---

## 📞 Support

- 🐛 **Bug reports:** [Open an issue](https://github.com/FidaHussain3432/Fare-App/issues)
- 💡 **Feature requests:** [Open an issue](https://github.com/FidaHussain3432/Fare-App/issues)
- 📧 **Email:** fh87022@gmail.com

---

<div align="center">

### ⭐ If this project helped you, please give it a star!

**Made with ❤️ for 24 Batch**

</div>
```

---

## 📌 Notes — Ise Kaise Use Karein

### 1. **Repo Root Mein `README.md` File Banayein**

```bash
touch README.md
# Upar ka poora content paste karein
```

### 2. **Super Admin Email Replace Karein**

Poori file mein **2 jagah** `your-email@example.com` likha hai:

- **Firebase Setup** section mein
- **Firestore Rules** section mein

Apna email daal dein (jaise `fh87022@gmail.com`).

### 3. **Repo URL Replace Karein**

Agar aapka GitHub username different hai to:

- `FidaHussain3432` → apna username
- `Fare-App` → apna repo name

Har jagah search kar lein.

### 4. **Optional: Screenshots Add Karein**

Agar aap chahein to `Screens & Workflow` section mein screenshots add kar sakte hain:

```markdown
![Login Screen](screenshots/login.png)
![Entry Tab](screenshots/entry.png)
![Boys Tab](screenshots/boys.png)
```

### 5. **Commit & Push**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
git push
```

---
