import postgres from "postgres";
import { encryptText } from "../../src/server/crypto";
import { hashPassword } from "../../src/server/password";

// Foundation fixture used by the dev seed, integration tests and end-to-end
// tests. Everything here is invented. Emails use the reserved .test domain.
// The full demo dataset (several hundred submissions, six weeks of history)
// is built in step 7 on top of this.

export const DEMO_PASSWORD = "redpen-demo-2026";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const IDS = {
  authorityDemo: id(1),
  authorityOther: id(2),
  schoolNorthgate: id(11),
  schoolRiverside: id(12),
  schoolHillcrest: id(13),
  schoolOther: id(14),
  authorityAdmin: id(101),
  otherAuthorityAdmin: id(102),
  northgateAdmin: id(111),
  northgateTeacher1: id(112),
  northgateTeacher2: id(113),
  northgateDisabled: id(114),
  riversideAdmin: id(121),
  riversideTeacher: id(122),
  hillcrestAdmin: id(131),
  otherAdmin: id(141),
  otherTeacher: id(142),
  classNorthgateSci: id(201),
  classNorthgateMaths: id(202),
  classNorthgateEng: id(203),
  classRiversideSci: id(211),
  classOtherMaths: id(221),
} as const;

export const EMAILS = {
  authorityAdmin: "authority.admin@demo-authority.test",
  otherAuthorityAdmin: "admin@other-authority.test",
  northgateAdmin: "admin@northgate.test",
  northgateTeacher1: "a.byrne@northgate.test",
  northgateTeacher2: "c.doyle@northgate.test",
  northgateDisabled: "former.teacher@northgate.test",
  riversideAdmin: "admin@riverside.test",
  riversideTeacher: "g.kerr@riverside.test",
  hillcrestAdmin: "admin@hillcrest.test",
  otherAdmin: "admin@other-school.test",
  otherTeacher: "teacher@other-school.test",
} as const;

type UserKey = keyof typeof EMAILS;

const USERS: { key: UserKey; name: string; role: "authority_admin" | "school_admin" | "teacher"; authority: string; school: string | null; disabled?: boolean }[] = [
  { key: "authorityAdmin", name: "Morgan Hale", role: "authority_admin", authority: IDS.authorityDemo, school: null },
  { key: "otherAuthorityAdmin", name: "Jordan Pike", role: "authority_admin", authority: IDS.authorityOther, school: null },
  { key: "northgateAdmin", name: "Sam Okafor", role: "school_admin", authority: IDS.authorityDemo, school: IDS.schoolNorthgate },
  { key: "northgateTeacher1", name: "Aoife Byrne", role: "teacher", authority: IDS.authorityDemo, school: IDS.schoolNorthgate },
  { key: "northgateTeacher2", name: "Ciaran Doyle", role: "teacher", authority: IDS.authorityDemo, school: IDS.schoolNorthgate },
  { key: "northgateDisabled", name: "Pat Former", role: "teacher", authority: IDS.authorityDemo, school: IDS.schoolNorthgate, disabled: true },
  { key: "riversideAdmin", name: "Lee Watts", role: "school_admin", authority: IDS.authorityDemo, school: IDS.schoolRiverside },
  { key: "riversideTeacher", name: "Grace Kerr", role: "teacher", authority: IDS.authorityDemo, school: IDS.schoolRiverside },
  { key: "hillcrestAdmin", name: "Robin Achebe", role: "school_admin", authority: IDS.authorityDemo, school: IDS.schoolHillcrest },
  { key: "otherAdmin", name: "Casey Lund", role: "school_admin", authority: IDS.authorityOther, school: IDS.schoolOther },
  { key: "otherTeacher", name: "Alex Moore", role: "teacher", authority: IDS.authorityOther, school: IDS.schoolOther },
];

const CLASSES = [
  { id: IDS.classNorthgateSci, school: IDS.schoolNorthgate, name: "9S1", year: 9, subject: "Science", teachers: [IDS.northgateTeacher1], prefix: "NG9S" },
  { id: IDS.classNorthgateMaths, school: IDS.schoolNorthgate, name: "10M2", year: 10, subject: "Mathematics", teachers: [IDS.northgateTeacher1], prefix: "NG10M" },
  { id: IDS.classNorthgateEng, school: IDS.schoolNorthgate, name: "8E3", year: 8, subject: "English", teachers: [IDS.northgateTeacher2], prefix: "NG8E" },
  { id: IDS.classRiversideSci, school: IDS.schoolRiverside, name: "9X", year: 9, subject: "Science", teachers: [IDS.riversideTeacher], prefix: "RV9X" },
  { id: IDS.classOtherMaths, school: IDS.schoolOther, name: "11A", year: 11, subject: "Mathematics", teachers: [IDS.otherTeacher], prefix: "OT11A" },
];

const FIRST = ["Niamh", "Oisin", "Erin", "Callum", "Saoirse", "Rory", "Maya", "Tomas", "Leah", "Finn"];
const LAST = ["Quinlan", "Marsh", "Fenwick", "Arden", "Dunmore", "Ellery", "Corran", "Vance", "Halloway", "Brantley"];

export async function seedFoundation(adminUrl: string, pupilNameKey: string): Promise<void> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await sql.begin(async (tx) => {
      await tx`insert into authority (id, name, is_demo) values
        (${IDS.authorityDemo}, 'Demo Education Authority', true),
        (${IDS.authorityOther}, 'Other Demo Authority', true)`;
      await tx`insert into school (id, authority_id, name) values
        (${IDS.schoolNorthgate}, ${IDS.authorityDemo}, 'Northgate High School'),
        (${IDS.schoolRiverside}, ${IDS.authorityDemo}, 'Riverside College'),
        (${IDS.schoolHillcrest}, ${IDS.authorityDemo}, 'Hillcrest Academy'),
        (${IDS.schoolOther}, ${IDS.authorityOther}, 'Other Authority School')`;
      for (const u of USERS) {
        await tx`insert into app_user (id, authority_id, school_id, email, display_name, role, password_hash, disabled_at)
          values (${IDS[u.key]}, ${u.authority}, ${u.school}, ${EMAILS[u.key]}, ${u.name}, ${u.role}, ${passwordHash},
                  ${u.disabled ? new Date() : null})`;
      }
      let n = 0;
      for (const c of CLASSES) {
        await tx`insert into class (id, school_id, name, year_group, subject)
          values (${c.id}, ${c.school}, ${c.name}, ${c.year}, ${c.subject})`;
        for (const t of c.teachers) {
          await tx`insert into class_teacher (class_id, user_id, school_id) values (${c.id}, ${t}, ${c.school})`;
        }
        for (let i = 1; i <= 6; i++, n++) {
          const name = `${FIRST[n % FIRST.length]} ${LAST[(n * 3) % LAST.length]}`;
          // Every sixth pupil has no recorded name, as the CSV name column is optional.
          const enc = i === 6 ? null : encryptText(name, pupilNameKey);
          await tx`insert into pupil (class_id, school_id, code, display_name_enc)
            values (${c.id}, ${c.school}, ${`${c.prefix}${String(i).padStart(2, "0")}`}, ${enc})`;
        }
      }
    });
  } finally {
    await sql.end();
  }
}
