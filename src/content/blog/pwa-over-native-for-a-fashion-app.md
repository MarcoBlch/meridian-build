---
title: "PWA Over Native for a Fashion App"
description: "Why I chose a Progressive Web App over native iOS/Android for OutfitMaker. Camera access works, installation works, and I don't need Apple's permission."
pubDate: 2026-04-18
tags: [pwa, mobile, rails, architecture]
project: outfitmaker
---

A wardrobe app needs a camera. A wardrobe app lives on your phone. A wardrobe app that's only accessible through a browser URL feels like a demo, not a product.

Every piece of conventional wisdom says: build native. Or at least use React Native. Or Flutter. Or Capacitor. Something that produces an actual app you download from a store, with an icon on your home screen.

I ignored all of that and built a Progressive Web App. Here's why, and what happened.

## What a PWA gives you on mobile

Let me be precise about what works in a PWA in 2026, because the capabilities have grown significantly since the early days:

**Camera access**: Full camera API via `getUserMedia` and the File input with `capture` attribute. Both work reliably on iOS Safari and Chrome Android. OutfitMaker users photograph their clothes directly in the browser. No native code needed.

**Home screen installation**: Users can "Add to Home Screen" on both iOS and Android. The app launches fullscreen, with your icon, splash screen, and no browser chrome. It looks and feels like a native app.

**Offline caching**: Service workers cache previously-viewed content. Users can browse their wardrobe offline (though generating new suggestions requires network connectivity).

**Background sync**: When network returns after being offline, pending actions (like clothing item edits) sync automatically.

**Responsive layout**: CSS handles the rest. The same codebase serves desktop and mobile with layout adjustments.

What a user experiences: they visit outfitmaker.ai on their phone, get prompted to install, tap "Add to Home Screen," and from that point on they have an app icon that launches a fullscreen experience with camera access. The friction is slightly higher than an App Store download (no one-tap install), but the delta is smaller than you'd think.

## Why I didn't go native

### Reason 1: One codebase, one developer

I'm one person. Maintaining a Rails backend, a React Native iOS app, and a React Native Android app (or their Swift/Kotlin equivalents) is three projects, not one. Each has its own build tooling, testing framework, deployment pipeline, and bug surface.

With a PWA, I have one codebase. One deployment. One test suite. When I fix a bug, it's fixed everywhere. When I ship a feature, it ships to all platforms simultaneously with `git push`.

### Reason 2: No App Store gatekeeping

Apple's review process takes days. They reject apps for arbitrary reasons. They take 30% of subscription revenue. They require you to maintain compliance with evolving guidelines.

My PWA deploys in 30 seconds. I keep 100% of Stripe revenue (minus Stripe's 2.9%). I don't need Apple's permission to ship. I don't need to maintain an Apple Developer account ($99/year). I don't need to deal with TestFlight, provisioning profiles, or code signing.

For a solo developer, the administrative overhead of the App Store is not trivial. It's hours per month of non-product work.

### Reason 3: Instant updates

When I fix a critical bug, the fix is live in 30 seconds. No "waiting for App Store review." No users stuck on old versions. No "please update the app" prompts. Everyone always runs the latest version.

### Reason 4: SEO and discoverability

A PWA is a website. It gets indexed by Google. My content marketing drives traffic directly to the app. Blog posts link to features. Feature pages are shareable URLs.

Native apps live in the App Store's search, which is pay-to-play for discoverability. A website lives on the open web, where good content and SEO can compete regardless of budget.

## The trade-offs (honest accounting)

### No push notifications on iOS

As of 2026, push notifications work on iOS PWAs. Apple added support in iOS 16.4. But the implementation is limited compared to native. The permission prompt is less prominent, and the reliability isn't 100%. For OutfitMaker, this means my "daily outfit suggestion" notification feature works on Android but is inconsistent on iOS.

This is genuinely the biggest functional gap. Daily notifications could be a significant retention driver, and I'm partially locked out of it on the dominant mobile platform.

### No App Store discovery

People browse the App Store for apps. They don't browse the web for PWAs. If "AI wardrobe app" searches in the App Store bring significant traffic, I'm missing it.

Counterargument: App Store search is incredibly competitive. For a solo developer with zero marketing budget, ranking for "wardrobe app" against VC-funded competitors is nearly impossible. At least on the web, good SEO content can compete.

### Slightly worse performance

Native apps have faster startup, smoother animations, and more efficient memory usage. For OutfitMaker, the difference is minimal; the app is lightweight, mostly server-rendered, and doesn't do heavy client-side computation.

But if I were building something with complex animations, real-time graphics, or intensive local processing? Native would be the right call.

### Storage limitations

iOS Safari limits PWA storage to ~50MB (up from the old 5MB, but still constrained). For OutfitMaker, clothing photos are stored server-side, so local storage is only used for caching. But if I wanted a fully offline-capable wardrobe with high-res images stored locally, I'd hit limits quickly.

### Perceived legitimacy

Some users don't trust apps that aren't in the App Store. "If it were real, it would be in the store." This is a psychological barrier, not a technical one, but it matters for conversion.

I partially mitigate this with a polished install experience: clear instructions, a professional splash screen, and an app-like UI that doesn't reveal its browser-based nature.

## The implementation

### manifest.json

```json
{
  "name": "OutfitMaker.ai",
  "short_name": "OutfitMaker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf7f5",
  "theme_color": "#c4703f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service worker (simplified)

```javascript
const CACHE_NAME = 'outfitmaker-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/assets/application.css',
  '/assets/application.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

### Camera access in Rails

```erb
<%= file_field_tag :photo,
    accept: "image/*",
    capture: "environment",
    data: { action: "change->upload#preview" } %>
```

That's it. The `capture` attribute opens the camera on mobile. The Stimulus controller handles the preview. The server handles the upload. No native bridges, no platform-specific code.

## The numbers

- 68% of OutfitMaker users are on mobile
- 34% of mobile users have "installed" the PWA (added to home screen)
- Installed users have 3x the session frequency of browser-only users
- Camera upload works for 100% of users (iOS and Android)
- Average Lighthouse PWA score: 95/100

## Would I choose differently?

If I were building a different kind of app (a game, a video editor, something needing Bluetooth or NFC), I'd go native. If I had funding for a dedicated mobile developer, maybe React Native.

But for a content-driven product that needs camera access, home screen presence, and fast iteration? A PWA served from Rails is the pragmatic choice for a solo developer. It's not the technically optimal choice. It's the productivity-optimal choice.

I can ship features at the speed of web development (fast), test them immediately (no build/install cycle), and iterate based on user feedback in hours, not days. For an early-stage product where learning speed is everything, that matters more than 60fps animations or access to the accelerometer.

The PWA bet is working. Users install it, use it daily, and most don't know (or care) that it's not from the App Store. The technology has matured enough that "web vs native" isn't the binary choice it once was. For most CRUD-with-camera apps, the web is enough. And "enough" is exactly what a solo developer needs.
