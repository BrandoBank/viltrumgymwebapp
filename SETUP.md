# BeeBuildz — Supabase Setup Guide

**Good news:** since you already have a Supabase project running The Cut, you don't need to create a new one. You can reuse your existing project and add BeeBuildz's tables alongside The Cut's. All BeeBuildz tables are prefixed with `bb_` so they won't collide with anything you already have.

**Bonus:** your girlfriend (or anyone else) will be able to sign in to BeeBuildz with the same email/password that works on The Cut — unified auth for free.

---

## 1. Add the BeeBuildz Schema

1. Open your existing Supabase dashboard at **https://supabase.com/dashboard**.
2. Click into your **Weightloss Tracker** project.
3. Left sidebar → **SQL Editor** → **New query**.
4. Paste the SQL below in full and click **Run**.

```sql
-- ═══════════════════════════════════════════════════════════
-- BeeBuildz Schema — all tables prefixed with bb_ to avoid
-- conflicts with The Cut's existing tables
-- ═══════════════════════════════════════════════════════════

-- 1. BB_PROFILES — per-user BeeBuildz profile metadata
create table if not exists bb_profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  height_inches integer,
  starting_weight numeric,
  goal_weight numeric,
  created_at timestamp with time zone default now()
);

alter table bb_profiles enable row level security;

create policy "BB: users read own profile" on bb_profiles
  for select using (auth.uid() = id);

create policy "BB: users insert own profile" on bb_profiles
  for insert with check (auth.uid() = id);

create policy "BB: users update own profile" on bb_profiles
  for update using (auth.uid() = id);

-- 2. BB_USER_DATA — JSONB blob mirroring all BeeBuildz app state
create table if not exists bb_user_data (
  user_id uuid references auth.users on delete cascade primary key,
  data jsonb not null default '{}',
  updated_at timestamp with time zone default now()
);

alter table bb_user_data enable row level security;

create policy "BB: users manage own data" on bb_user_data
  for all using (auth.uid() = user_id);

-- 3. BB_PROGRAMS — saved workout programs (supports multiple per user)
create table if not exists bb_programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text,
  data jsonb not null,
  is_active boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table bb_programs enable row level security;

create policy "BB: users manage own programs" on bb_programs
  for all using (auth.uid() = user_id);

create index if not exists idx_bb_programs_user on bb_programs(user_id);
create index if not exists idx_bb_programs_active on bb_programs(user_id, is_active);
```

You should see "Success. No rows returned." The three new tables are live with Row Level Security enabled — users can only read/write their own rows.

---

## 2. Get Your Project URL and Anon Key

Since The Cut already uses this project, you may already have these saved somewhere. If not:

1. Left sidebar → **Project Settings** (gear icon at the bottom) → **API**.
2. Copy:
   - **Project URL** — e.g., `https://bawfkgigdzbosiwwdhaq.supabase.co`
   - **anon / public key** — the one labeled "anon public", **NOT** `service_role` (that one is sensitive)

---

## 3. Connect BeeBuildz

1. Open your deployed BeeBuildz site.
2. You'll see the **"Connect Your Backend"** screen on first load.
3. Paste the **Project URL** in the first field.
4. Paste the **anon key** in the second field.
5. Click **CONNECT**.

The page reloads into the **Sign In / Sign Up** screen.

---

## 4. Create Accounts

**For you:**
- Click **Sign up** and enter a new email + password
- **OR** if you want to use the same email you use for The Cut, click **Sign in** instead — that account already exists in Supabase's auth system. BeeBuildz will detect you don't have a BeeBuildz profile yet and walk you through profile setup.
- Fill out the profile (display name, starting weight 310, goal 210, height in inches)

**For your girlfriend:**
- She opens the same BeeBuildz URL on her phone
- Clicks **Sign up** with her own email
- Creates her profile with her own starting/goal weights
- Done — totally isolated data from yours

Each of you can sign in on any device and find your data already there.

---

## 5. Verify Sync Is Working

After signing in, watch the bottom-left corner of the app whenever you:
- Log a workout set
- Add a weight entry
- Complete a session

You should see **`⟳ SYNCING…`** flash, then **`✓ SYNCED`**. That's writing to Supabase.

To double-check in Supabase: **Dashboard → Table Editor → bb_user_data**. You should see a row with your `user_id` and a `data` JSONB column containing your app state.

---

## How It Coexists With The Cut

| Feature | The Cut | BeeBuildz |
|---|---|---|
| Auth (users) | `auth.users` — **shared** | `auth.users` — **shared** |
| Profile | The Cut's own table | `bb_profiles` |
| Data storage | The Cut's own tables | `bb_user_data`, `bb_programs` |
| Same email signs into both? | Yes (shared auth) | Yes (shared auth) |
| Your data | Completely isolated | Completely isolated |
| Can apps share data? | Not yet — Phase 3 feature | Not yet — Phase 3 feature |

Row Level Security on every BeeBuildz table ensures users only see their own rows. Even if someone had your SQL, they couldn't read each other's data through the public anon key.

---

## Phase 3 Idea: Pull Bodyweight From The Cut

Since both apps share the same Supabase project and same user ID, you could eventually have BeeBuildz auto-read your weigh-ins from The Cut's weight table — no double-logging.

To build this later, just tell me the name of The Cut's weight table and its columns (date, weight, user_id, etc.) and I'll add a cross-app read query to BeeBuildz's Weight tab.

---

## Troubleshooting

**"User already registered" on signup**
- Your email already has an auth row from The Cut. Click **Sign in** instead with the same credentials — BeeBuildz will detect no `bb_profiles` row and walk you through profile setup.

**"permission denied for table bb_user_data"**
- RLS policies didn't apply correctly. Go back to SQL Editor, re-run the schema. Every `alter table ... enable row level security` and `create policy` line must succeed.

**Sync indicator stuck on "SYNCING…"**
- Open browser dev tools → Console → check for errors. Usually means RLS misconfig, wrong anon key, or internet issue.

**Want to reset BeeBuildz data without affecting The Cut**
- Supabase dashboard → Table Editor → `bb_user_data` → delete your user's row. Your Cut data is untouched.
- Or reset everything: delete rows from `bb_profiles`, `bb_user_data`, `bb_programs` for your user_id.

**Want to change Supabase URL/key later**
- Open browser dev tools → Application → Local Storage → delete `bb_supabase_url` and `bb_supabase_key` → reload BeeBuildz. You'll see the setup screen again.

---

## Cost (still $0)

Supabase free tier covers:
- 500 MB database — The Cut + BeeBuildz combined will use <5 MB
- 50K monthly active users — you're at 2
- Unlimited API requests for personal use

You will never pay Supabase for this stack.

---

## Sign Out / Switch Users

- Click your avatar (top-right) → **Sign Out**
- Clears the session on this device
- Sign in with different credentials to switch users
- All data stays in Supabase keyed to each user's auth.uid() — nothing is lost when switching

---

## iOS Home Screen Icon — Cache Busting

Apple caches the `apple-touch-icon.png` aggressively. After redeploying updated icons, the old bee may persist on the home screen. Here's the dance to force a refresh:

**After any icon update:**

1. **Remove the app from your home screen** — long press the icon → Remove App → Remove from Home Screen (this doesn't delete data, just the shortcut)
2. **Open Safari** and navigate to `viltrumgymtrainer.netlify.app`
3. **Force-quit Safari** first if the old icon still shows in the share sheet: double-tap home / swipe up → swipe Safari away → reopen
4. **Share → Add to Home Screen** — you should now see the new bee icon in the preview

**If the icon still shows old after step 4:**

- In Safari, go to `Settings → Safari → Clear History and Website Data` — this nukes the icon cache
- Repeat steps 2–4

**Why this happens:** iOS caches the touch icon at the OS level, separate from Safari's regular cache. The share-sheet preview is what gets burned in. There's no programmatic cache-bust — you have to physically remove and re-add.

---

## Resetting a User's Data (e.g. after a bug)

To wipe a specific user's BeeBuildz data without touching their auth account or other users:

```sql
-- Step 1: Find their user ID
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'their@email.com';

-- Step 2: Wipe their BeeBuildz rows (swap in their actual UUID)
DO $$
DECLARE
  target_id uuid;
BEGIN
  SELECT id INTO target_id FROM auth.users WHERE email = 'their@email.com';
  DELETE FROM bb_user_data  WHERE user_id = target_id;
  DELETE FROM bb_programs   WHERE user_id = target_id;
  DELETE FROM bb_profiles   WHERE id      = target_id;
  RAISE NOTICE 'Deleted BeeBuildz data for: %', target_id;
END $$;
```

Their login still works — they'll be walked through fresh profile setup on next sign-in. Run in Supabase Dashboard → SQL Editor.
