# PSU Balabac Faculty Course Selection & Scheduling

**Phase 1 implementation:** PSU corporate-email invited registration, email OTP, password setup, faculty profile, and admin-only invitation management. Separate from the existing exam site.

## Getting started

1. Create a **new Supabase project** (do not reuse the exam project).
2. In Supabase SQL Editor run `supabase/migrations/001_phase1.sql`.
3. Bootstrap the FIRST admin's invitation using SQL Editor (replace the email):
   ```sql
   insert into public.faculty_invitations(email,department)
   values ('admin@psu.palawan.edu.ph','BEEd');
   ```
4. In **Supabase → Authentication → Providers → Email**, enable Email OTP, and configure the email template to expose `{{ .Token }}` (not only the magic link). Set Auth Site URL to your Vercel domain when available. Set a production SMTP provider before inviting faculty at scale.
5. In project root run `npm install`, copy `.env.example` to `.env.local` and replace placeholders using **the new project's URL and publishable/anon key only**. Never place a Supabase service-role key in Vite or in GitHub.
6. Run `npm run dev`, visit the local URL, then register with the invited admin email, verify OTP, set password, and complete the profile.
7. In Supabase SQL Editor promote the first admin:
   ```sql
   update public.profiles set role='admin' where email='admin@psu.palawan.edu.ph';
   ```
8. Reload the website. The administrator can now authorize additional faculty emails.
9. Push this project into a **new independent GitHub repository** and import it in Vercel. Choose Vite framework, build command `npm run build`, output directory `dist`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production, preview and development in Vercel and redeploy.

## Account flow

- An admin creates an email invitation, which includes a department.
- A signup can proceed only for an explicitly invited `@psu.palawan.edu.ph` email. Both app and auth.users database trigger enforce the allowlist.
- User receives and verifies an email OTP; Supabase establishes an authenticated session.
- User sets a password (minimum 12 characters), then enters username, uppercase first and last names, middle initial, department and employment type. The server pins the account email, department, role and account status to trusted records.
- Administrator can see invitation statuses. Future modules will add full account lifecycle management, course requests, qualifications, section schedules, workload rules, venue inventory and workload exports.

## Decisions captured for upcoming phases

- Admin-configurable regular/part-time faculty workload limits (no default numeric values).
- Administrator override of unavailability requires justification and audit trail.
- Admin may assign unrequested subjects, with faculty notification.
- Qualifications displayed as decision support; administrator retains final assignment authority.
- A separate class per block: BEEd 1–4, BSE 1 AB/FT, BSE 2 AB/FT, BSE 3A/3B FT, BSE 4 FT.
- BEEd 1–2 new curriculum and BEEd 3–4 old curriculum.
- Regular 3-unit courses: same times MW or TTh. PATHFit: continuous 2 hours any weekday. NSTP: 3 continuous hours Friday. Special courses require administrator-defined contact hours.
- Faculty may select course, schedule, and room; administrator approves. Faculty can submit post-publication change requests.
- FWL export must follow uploaded editable PSU-ACA-031 Word template, including WHE adjustments and approver fields.

## Security notes

- Public signups blocked by trigger unless faculty email was invited. Avoid advertising that every PSU email automatically qualifies.
- Auth email rate limits and SMTP delivery must be configured by the Supabase project owner.
- Only admin role can insert new invitations via RLS. User-driven role escalation is not exposed.
- This Phase 1 build intentionally does **not** claim that scheduling, PDF/DOCX export or qualification checks are implemented yet.
- Authentication does not provide secret access to Vercel projects or the existing exam system.
