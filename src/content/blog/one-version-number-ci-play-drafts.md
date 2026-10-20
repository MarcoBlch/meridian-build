---
title: "Why I Stopped Bumping Version Numbers by Hand"
description: "How KidCapital's release 4.5 moved to one APP_VERSION in CI for iOS and Android, plus an automatic Google Play upload that lands as a draft so a human still presses publish."
pubDate: 2026-10-20
tags: [architecture, indie-hacker]
project: kidcapital
---

[KidCapital](/projects/kidcapital/) is a side project of mine: a board game app that teaches kids about money. It ships on iOS and Android from a single GitHub Actions workflow. I've written before about [how its mascot talks without an LLM](/blog/llm-in-a-kids-app-pre-generated-dialogue/). This post is about something less fun and more useful: how a release actually gets out of the repo, and the small change I made for 4.5 so that I stop getting the version number wrong.

## Two numbers per store, typed in two places

Each store wants two numbers from you.

The first is the build number. It only has to go up. In my workflow it's already automatic: both jobs use `github.run_number`, which becomes `CURRENT_PROJECT_VERSION` on iOS and `versionCode` on Android. Nothing to remember there.

The second is the version users see, like "4.4". That one I was typing by hand. Twice. Here's what the two bump steps looked like before 4.5:

```yaml
# iOS job
sed -i '' "s/MARKETING_VERSION = 1.0;/MARKETING_VERSION = 4.4;/g" project.pbxproj

# Android job
sed -i 's/versionName "[^"]*"/versionName "4.4"/g' android/app/build.gradle
```

Two hardcoded strings, in two jobs, more than a hundred lines apart in the same file. Nothing tied them together, and nothing tied them to what I'd set up in the stores.

## What broke

Apple is strict about this. App Store Connect only accepts a build into a version with the same number. If you create version 4.5 in App Store Connect and CI uploads a build that says 4.4, that build can't be attached to 4.5.

That's exactly where I ended up. I'd moved on to 4.5 in App Store Connect, but the workflow still said 4.4, so build 70 came out as 4.4 and could not be attached to the release I was preparing. Editing the string again would have fixed 4.5 and set up the same mistake for 4.6. The real fix was to stop having two strings.

## One number at the top of the file

The workflow now declares the store version once, at the top, as a workflow-level env var:

```yaml
# Store version shown to users on both platforms. Bump it here, once per release:
# App Store Connect only accepts a build into a version with the same number.
env:
  APP_VERSION: "4.5"
```

And both bump steps read from it:

```yaml
# iOS job
sed -i '' "s/MARKETING_VERSION = 1.0;/MARKETING_VERSION = ${{ env.APP_VERSION }};/g" project.pbxproj

# Android job
sed -i "s/versionCode [0-9]*/versionCode ${{ github.run_number }}/g" android/app/build.gradle
sed -i 's/versionName "[^"]*"/versionName "${{ env.APP_VERSION }}"/g' android/app/build.gradle
```

The comment is the important part. It's there for future me, who will open this file in a few months having forgotten the Apple rule. The order is now: bump `APP_VERSION` first, then create the new version in App Store Connect, then let the next build on master pick it up. iOS `MARKETING_VERSION` and Android `versionName` can't drift apart anymore, because there's only one place to change.

It's a tiny diff. Most of the value is that a release now starts with a one-line change I can't half-do.

## The Android job used to stop at a zip file

The iOS job already ended with an upload to App Store Connect. The Android job didn't. It built the release AAB and attached it to the Actions run as an artifact, and that was it. Getting it into Google Play meant downloading that file and uploading it in Play Console by hand.

So the same PR added an upload step at the end of the Android job, using `r0adkll/upload-google-play`:

```yaml
build-android:
  runs-on: ubuntu-latest
  env:
    # Job-level so the upload step's `if` can see whether the secret is set.
    PLAY_SERVICE_ACCOUNT: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
  steps:
    # ... build, sign, upload the AAB artifact ...

    - name: Upload to Google Play
      if: ${{ env.PLAY_SERVICE_ACCOUNT != '' && github.ref == 'refs/heads/master' }}
      uses: r0adkll/upload-google-play@v1
      with:
        serviceAccountJsonPlainText: ${{ env.PLAY_SERVICE_ACCOUNT }}
        packageName: com.marcobloch.kidcapital
        releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
        releaseName: ${{ env.APP_VERSION }} (${{ github.run_number }})
        track: production
        status: draft
```

A few details in there were deliberate.

**The secret goes through a job-level env var.** A step's `if` can't usefully check a secret directly, so I copy it into `PLAY_SERVICE_ACCOUNT` at the job level and test that. If the secret isn't set, the step is skipped instead of failing the whole job, and the AAB artifact is still there to download. That let me merge the workflow change before the Play side was ready.

**Only master uploads.** The workflow also runs on pushes to a `v4-multiplayer` branch. Those builds still produce artifacts, but they never reach Play.

**The release name reuses the same variable.** `4.5 (72)` in Play Console tells me the store version and the CI run that produced it, without me typing either.

## Why drafts, not live releases

`track: production` with `status: draft` means the bundle lands in Play Console as a draft production release. Nothing goes to users until I open Play Console and send it for review myself.

That matches how the iOS side already works. The iOS job stops after uploading to App Store Connect; submitting is still a step I take there. I wanted both stores to behave the same way: CI does the boring transport, and the decision to ship stays a click by a person.

For a kids app that matters to me. A merge to master happens a lot more casually than a release should. I'd rather have a draft sitting in Play Console that I look at before it goes out than a pipeline that publishes whatever was last merged. Automating the upload and keeping the publish manual takes away the tedious part and leaves the judgment part.

## Two things that went wrong on the way

The first one was on my side. I had created the Play service account secret in GitHub under a different name than the one in the workflow. Until that was fixed, the upload step was simply skipped. A follow-up PR changed two lines to point the upload step at the name I'd actually used. The skip-if-missing guard did its job there: no red build, just a skipped step.

The second was on the Google side. A service account with valid credentials isn't enough. It also has to be invited as a user in Play Console, otherwise the API answers with "The caller does not have permission". If you set this up, do that part in Play Console before you start debugging the YAML.

## Where 4.5 ended up

4.5 went out to both stores on October 16. On iOS, builds 71 and 72 went to App Store Connect. On Android, build 72 landed in Play Console as a draft production release, uploaded by CI and waiting for me to send it for review.

The next release starts with one edit: change `APP_VERSION`, push to master, then go to each store and decide whether to ship what CI dropped off.

## What I'd keep if I started over

- **One source of truth for the user-facing version**, declared at the top of the workflow with a comment explaining the store rule that bites if you skip it.
- **Build numbers from the CI run number**, so they always go up and you never think about them.
- **Automatic uploads, manual publish.** Let CI carry the binary all the way to the store, and stop at the step where a human decides.
- **Optional steps guarded on their secret**, so you can merge the pipeline before every credential exists.

None of this is clever. It's the kind of thing you only set up after a build comes out with the wrong number on it. Mine was build 70.
