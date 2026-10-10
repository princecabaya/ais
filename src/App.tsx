import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, LogOut, Mail, ShieldCheck, UserRound, Users } from 'lucide-react';
import { configured, domainOk, supabase } from './supabase';
import { PSU_LOGO } from './psuLogo';
import { CurriculumManagement } from './CurriculumManagement';
import { CourseSelection } from './CourseSelection';
import { FacultyAvailability } from './FacultyAvailability';
import { RoomScheduling } from './RoomScheduling';
import { AdministratorApproval } from './AdministratorApproval';
import { OfficialWorkload } from './OfficialWorkload';
import { AcademicTermSettings } from './AcademicTermSettings';
import type { Session } from '@supabase/supabase-js';

type Profile = {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  middle_initial: string | null;
  department: 'BEEd' | 'BSE' | 'Administration';
  employment_type: 'regular' | 'tempo' | 'cos' | 'part_time';
  role: 'faculty' | 'admin';
  status: 'active' | 'pending' | 'disabled';
};

type Invite = {
  email: string;
  department: string;
  created_at: string;
  used_at: string | null;
};

const normal = (value: string) => value.toUpperCase().trim().replace(/\s+/g, ' ');

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState<'email' | 'link-sent' | 'password' | 'profile'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [mi, setMi] = useState('');
  const [department, setDepartment] = useState<'BEEd' | 'BSE' | 'Administration'>('BEEd');
  const [employment, setEmployment] = useState<'regular' | 'tempo' | 'cos' | 'part_time'>('regular');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDept, setInviteDept] = useState<'BEEd' | 'BSE' | 'Administration'>('BEEd');
  const [inviteRole, setInviteRole] = useState<'faculty' | 'admin'>('faculty');
  const [adminEmails, setAdminEmails] = useState<string[]>([]);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase!.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) setMessage(error.message);
    setProfile((data as Profile | null) || null);
  }

  async function loadInvites() {
    const { data, error } = await supabase!
      .from('faculty_invitations')
      .select('email,department,created_at,used_at')
      .order('created_at', { ascending: false });
    if (error) setMessage(error.message);
    else setInvites((data || []) as Invite[]);
    const { data: authorizations, error: authError } = await supabase!.from('administrator_authorizations').select('email');
    if (authError) setMessage(authError.message);
    else setAdminEmails((authorizations || []).map((row) => row.email as string));
  }

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user.id) {
      void loadProfile(session.user.id);
      setStep((current) => current === 'profile' ? 'profile' : 'password');
    } else setProfile(null);
  }, [session?.user.id]);

  useEffect(() => {
    if (profile?.role === 'admin') void loadInvites();
  }, [profile?.role]);

  async function sendConfirmationLink(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    if (!domainOk(email)) {
      setMessage('A valid @psu.palawan.edu.ph address is required.');
      return;
    }
    setBusy(true);
    try {
      const { data: allowed, error: allowErr } = await supabase!.rpc('is_invited_email', { candidate_email: email.trim().toLowerCase() });
      if (allowErr) throw allowErr;
      if (!allowed) throw new Error('This email is not on the administrator invitation list.');
      const { error } = await supabase!.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` } });
      if (error) throw error;
      setStep('link-sent');
      setMessage('A secure confirmation or sign-in link has been requested. Open the latest email and follow its link to return here.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setMessage('Use a password of at least 12 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setStep('profile');
      setMessage('Password saved. Complete your faculty profile.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!session) throw new Error('Log in first.');
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) throw new Error('Username must be 3–30 letters, numbers, dots, underscores or hyphens.');
      if (!first.trim() || !last.trim()) throw new Error('First name and last name are required.');
      if (mi.trim() && !/^[A-Za-z]\.?$/.test(mi.trim())) throw new Error('Middle initial must contain one letter.');
      const { error } = await supabase!.from('profiles').insert({
        id: session.user.id,
        username: username.toLowerCase(),
        first_name: normal(first),
        last_name: normal(last),
        middle_initial: mi.trim() ? normal(mi).replace('.', '') + '.' : null,
        department,
        employment_type: employment,
      });
      if (error) throw error;
      await loadProfile(session.user.id);
      setMessage('Profile submitted. Welcome to the faculty portal.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!domainOk(inviteEmail)) throw new Error('Only PSU corporate email addresses are allowed.');
      const { error } = await supabase!.from('faculty_invitations').insert({ email: inviteEmail.trim().toLowerCase(), department: inviteDept, invited_by: session!.user.id });
      if (error) throw error;
      if (inviteRole === 'admin') {
        const { error: grantError } = await supabase!.rpc('grant_administrator', { candidate_email: inviteEmail.trim().toLowerCase() });
        if (grantError) throw grantError;
      }
      setInviteEmail('');
      await loadInvites();
      setMessage(inviteRole === 'admin' ? 'Administrator email authorized. Share the portal address for PSU email verification.' : 'Faculty email authorized. Share the portal address with the faculty member.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    setProfile(null);
    setStep('email');
    setMessage('Signed out.');
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo-wrap">
            <img src={PSU_LOGO} alt="Palawan State University logo" className="brand-logo" />
          </div>
          <div>
            <strong>PALAWAN STATE UNIVERSITY</strong>
            <small>Balabac Campus · Faculty Scheduling</small>
          </div>
        </div>
        <div className="topright">
          <span className="pill">AY 2026–2027</span>
          {session && (
            <button className="ghost" onClick={logout}>
              <LogOut size={16} /> Sign out
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-badge">
            <img src={PSU_LOGO} alt="Palawan State University seal" className="hero-logo" />
            <span className="kicker">INDEPENDENT ACADEMIC PORTAL</span>
          </div>
          <h1>Faculty Course Selection<br /><em>& Scheduling System</em></h1>
          <p>Secure faculty registration, curriculum-aligned course preferences, conflict-aware timetables, and administrator-approved workload assignments.</p>
        </section>

        {!configured ? (
          <div className="panel warning">
            <h2>Supabase connection needed</h2>
            <p>Create a separate Supabase project and configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel. The application does not connect to your examination database.</p>
          </div>
        ) : !session ? (
          <div className="panel auth">
            <div className="iconhead"><Mail /><span>Faculty access</span></div>
            {step === 'email' ? (
              <form onSubmit={sendConfirmationLink}>
                <h2>Verify your university email</h2>
                <p>Your address must be pre-authorized by the scheduling administrator.</p>
                <label>PSU corporate email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="faculty@psu.palawan.edu.ph" /></label>
                <button disabled={busy} className="primary">{busy ? 'Sending…' : 'Send confirmation link'}</button>
              </form>
            ) : (
              <div className="link-confirmation">
                <h2>Check your PSU email inbox</h2>
                <p>Open the newest message for <strong>{email}</strong> and click its confirmation or sign-in link. You will return to this website to set a password and complete your profile.</p>
                <button type="button" className="link" onClick={() => setStep('email')}>Use another email or resend link</button>
              </div>
            )}
          </div>
        ) : !profile ? (
          <div className="panel auth">
            <div className="iconhead"><UserRound /><span>First-time account setup</span></div>
            {step !== 'profile' ? (
              <form onSubmit={setNewPassword}>
                <h2>Create your password</h2>
                <label>Password (12+ characters)<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
                <button className="primary" disabled={busy}>Save password</button>
              </form>
            ) : (
              <form onSubmit={saveProfile}>
                <h2>Complete faculty profile</h2>
                <p>Your PSU identity is {session.user.email}. All names will be stored in uppercase.</p>
                <label>Username<input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="faculty.username" /></label>
                <div className="two">
                  <label>Last name<input required value={last} onChange={(e) => setLast(e.target.value)} placeholder="DELA CRUZ" /></label>
                  <label>First name<input required value={first} onChange={(e) => setFirst(e.target.value)} placeholder="JUAN" /></label>
                </div>
                <label>Middle initial<input maxLength={2} value={mi} onChange={(e) => setMi(e.target.value)} placeholder="A." /></label>
                <div className="two">
                  <label>Faculty affiliation<select value={department} onChange={(e) => setDepartment(e.target.value as 'BEEd' | 'BSE' | 'Administration')}><option value="BEEd">BEEd</option><option value="BSE">BSE</option><option value="Administration">Campus Administration</option></select></label>
                  <label>Employment type<select value={employment} onChange={(e) => setEmployment(e.target.value as 'regular' | 'tempo' | 'cos' | 'part_time')}><option value="regular">Regular — Plantilla (Full-time)</option><option value="tempo">Tempo — Conditional Plantilla (Full-time)</option><option value="cos">COS — Contract of Service (Full-time)</option><option value="part_time">Part-time</option></select></label>
                </div>
                <button disabled={busy} className="primary">Save profile</button>
              </form>
            )}
          </div>
        ) : (
          <section className="dashboard">
            <div className="welcome">
              <div>
                <span className="kicker">FACULTY DASHBOARD</span>
                <h2>Welcome, {profile.first_name} {profile.last_name}</h2>
                <p>{profile.department} Faculty · {({regular:'Regular · Plantilla (Full-time)',tempo:'Tempo · Conditional Plantilla (Full-time)',cos:'COS · Contract of Service (Full-time)',part_time:'Part-time'} as const)[profile.employment_type]} · {profile.role === 'admin' ? 'Administrator' : 'Faculty'}</p>
              </div>
              <span className="status"><CheckCircle2 size={16} /> {profile.status}</span>
            </div>
            <div className="cards">
              <article><BookOpen /><strong>Course preferences</strong><p>Select courses across BEEd and BSE, rank preferences, and submit for administrative approval.</p><span>Available below</span></article>
              <article><CalendarDays /><strong>Faculty availability</strong><p>Set preferred and unavailable teaching periods and review authorized exceptions.</p><span>Available below</span></article>
              <article><ClipboardList /><strong>Official workload</strong><p>Export editable PSU-ACA-031 Word documents from approved course schedules.</p><span>Available below</span></article>
            </div>
            {profile.role === 'admin' && <AcademicTermSettings />}
            <CourseSelection facultyId={profile.id} isAdmin={profile.role === 'admin'} />
            <FacultyAvailability facultyId={profile.id} isAdmin={profile.role === 'admin'} />
            <RoomScheduling facultyId={profile.id} isAdmin={profile.role === 'admin'} />
            <OfficialWorkload facultyId={profile.id} isAdmin={profile.role === 'admin'} />
            {profile.role === 'admin' && (
              <>
              <AdministratorApproval />
              <CurriculumManagement />
              <div className="panel admin">
                <div className="iconhead"><ShieldCheck /><span>Administrator · Faculty authorization</span></div>
                <p>Only the listed PSU email accounts may begin confirmation-link registration.</p>
                <form className="inviteform" onSubmit={addInvite}>
                  <label>Faculty email<input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="instructor@psu.palawan.edu.ph" /></label>
                  <label>Department<select value={inviteDept} onChange={(e) => setInviteDept(e.target.value as 'BEEd' | 'BSE' | 'Administration')}><option value="BEEd">BEEd</option><option value="BSE">BSE</option><option value="Administration">Campus Administration</option></select></label>
                  <label>Role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'faculty' | 'admin')}><option value="faculty">Faculty</option><option value="admin">Administrator</option></select></label>
                  <button className="primary" disabled={busy}>Authorize email</button>
                </form>
                <h3>Authorized email list</h3>
                <div className="invites">
                  {invites.length ? invites.map((value) => (
                    <div key={value.email}>
                      <span>{value.email}<small>{value.department}</small></span>
                      <span className="pill">{adminEmails.includes(value.email) ? 'Admin · ' : ''}{value.used_at ? 'Registered' : 'Invited'}</span>
                    </div>
                  )) : <p>No invitations yet. Add your first faculty email.</p>}
                </div>
              </div>
              </>
            )}
          </section>
        )}

        {message && <div className="notice" role="status">{message}</div>}

        <section className="features">
          <div><ShieldCheck /><strong>Corporate email protection</strong><small>PSU domain + verified invitation</small></div>
          <div><Users /><strong>Independent faculty records</strong><small>Separate from the examination system</small></div>
          <div><CalendarDays /><strong>Approval-led scheduling</strong><small>Administrator has final authority</small></div>
        </section>
      </main>

      <footer>Palawan State University · Balabac Campus <span>Phase 1 · Faculty Authentication</span></footer>
    </div>
  );
}
