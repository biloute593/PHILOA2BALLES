# Firestore Security Specification (PHILOA2BALLE)

## 1. Data Invariants
1. **Strict Owner Isolation & Verified Identity**: Every user document (`/users/{userId}`) and subcollection document (`/users/{userId}/episodes/{episodeId}`, `/users/{userId}/settings/{settingId}`, `/users/{userId}/memoryNotes/{noteId}`) is readable and writable **only** by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Parent Existence (Master Gate)**: An `EpisodeDoc`, `StudioSettingsDoc`, or `MemoryNoteDoc` cannot be created or updated unless the parent `/users/{userId}` document exists (`exists(/databases/$(database)/documents/users/$(userId))`).
3. **Immutable Ownership & Creation Timestamps**: `ownerId`, `id`, `clientCreatedAt`, and `createdAt` are locked after creation (`incoming().ownerId == existing().ownerId`, `incoming().createdAt == existing().createdAt`).
4. **Server-Authoritative Time**: All `createdAt` on create and `updatedAt` on create/update MUST equal `request.time`.
5. **No Blanket Reads or User Enumeration**: `allow list` on `/users` is `false`. `allow list` on `/users/{userId}/episodes`, `/users/{userId}/settings`, and `/users/{userId}/memoryNotes` explicitly checks `resource.data.ownerId == request.auth.uid` without calling `get()`/`exists()`.
6. **Strict Schema & Size Bounding**: Every string, number, enum, and array has explicit `.size()` / range / allowlist checks; unknown or shadow fields are rejected via `hasAll` + `hasOnly` and `affectedKeys().hasOnly()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: `request.auth == null` reading `/users/alice/episodes/ep-01-freeguy`.
2. **Unverified Email Spoof**: `request.auth != null`, `request.auth.uid == 'alice'`, `request.auth.token.email_verified == false` writing `/users/alice`.
3. **Cross-User Read (PII Leak)**: Signed-in verified user `bob` reading `/users/alice` or `/users/alice/episodes/ep-01-freeguy`.
4. **Cross-User Query Enumeration**: Signed-in verified user `bob` listing `/users/alice/episodes`.
5. **Identity Spoofing on Create**: Signed-in verified user `alice` creating `/users/alice/episodes/ep-99` with `ownerId: "bob"`.
6. **Shadow / Ghost Field Injection**: User `alice` creating or updating `/users/alice` with `{ ..., isAdmin: true }` or `/users/alice/episodes/ep-01` with `{ ..., publishedOverride: true }`.
7. **Path ID Poisoning**: User `alice` creating `/users/alice/episodes/invalid$id@with!spaces` or a >128 char document ID.
8. **Denial-of-Wallet String Bloat**: User `alice` updating `draftThoughts` to a 50,000-character string (>20,000 max) or `title` to 1,000 chars (>300 max).
9. **Unbounded Array Explosion**: User `alice` updating `segments` with 41 items (>40 max) or `notes` with 61 items (>60 max).
10. **Client-Forged Timestamp**: User `alice` creating `/users/alice/episodes/ep-02` with `createdAt: Timestamp(2020-01-01)` instead of `request.time`, or changing `createdAt` during `update`.
11. **Orphaned Subcollection Write**: User `alice` creating `/users/alice/episodes/ep-01` before `/users/alice` profile document exists.
12. **Immutable Key Mutation**: User `alice` updating `/users/alice/episodes/ep-01` attempting to mutate `id` or `ownerId` or setting `settingId` to an arbitrary ID other than `'studio'`.
