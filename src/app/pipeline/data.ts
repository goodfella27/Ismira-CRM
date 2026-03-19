import { Candidate, Pool, Stage } from "./types";

export const stages: Stage[] = [
  { id: "consultation", name: "CONSULTATION", order: 0 },
  { id: "uploaded", name: "UPLOADED", order: 1 },
  { id: "ready", name: "READY TO GO", order: 2 },
  { id: "pre-screen", name: "PRE-SCREEN", order: 3 },
  { id: "reminder", name: "REMINDER", order: 4 },
  { id: "tofollowup", name: "TOFOLLOWUP", order: 5 },
  { id: "no-show", name: "NO SHOW PRE...", order: 6 },
  { id: "needs-improve", name: "NEED IMPROVE...", order: 7 },
];

export const pools: Pool[] = [
  { id: "roomy", name: "Roomy" },
  { id: "legend", name: "Legend Selection" },
  { id: "fairview", name: "Fairview Hotel" },
  { id: "trullo", name: "Trullo" },
  { id: "royal", name: "Royal" },
];

const firstNames = [
  "Olena",
  "Kateryna",
  "Nadiya",
  "Svitlana",
  "Mariya",
  "Tetiana",
  "Anastasiia",
  "Daria",
  "Yuliia",
  "Iryna",
  "Khrystyna",
  "Oksana",
  "Polina",
  "Sofia",
  "Viktoria",
  "Alina",
  "Yevhen",
  "Dmytro",
  "Oleksii",
  "Mykhailo",
  "Artem",
  "Maksym",
  "Ivan",
  "Bohdan",
  "Serhii",
  "Andrii",
  "Taras",
  "Ihor",
  "Roman",
  "Denys",
  "Karina",
  "Milana",
  "Nazar",
  "Liliia",
  "Yana",
  "Vitalii",
];

const lastNames = [
  "Koval",
  "Petryshyna",
  "Tkalia",
  "Shushko",
  "Bilashova",
  "Dubynchak",
  "Ralian",
  "Butsenko",
  "Vatutina",
  "Shapoval",
  "Teslenko",
  "Stupko",
  "Kuznetsova",
  "Levychuk",
  "Pryshchepa",
  "Horobovska",
  "Savych",
  "Holtseva",
  "Dzernovych",
  "Lysychkina",
  "Musiyenko",
  "Kovalenko",
  "Kozlovskyi",
  "Kulyvush",
  "Shchastna",
  "Konko",
  "Hordiychuk",
  "Myronenko",
  "Borysov",
  "Rudyk",
  "Kamenkova",
  "Morozov",
  "Stepaniuk",
  "Hodorov",
  "Granov",
  "Ivanchenko",
  "Babin",
];

const roles = [
  "Waitress",
  "Bartender",
  "Receptionist",
  "Housekeeper",
  "Chef",
  "Server",
  "Cook",
  "Host",
  "Sales Assistant",
  "Customer Service",
];

const sources = [
  "Webform",
  "Referral",
  "Facebook",
  "Instagram",
  "MailerLite",
  "Recruiter",
];

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDateWithin(days: number) {
  const now = Date.now();
  const range = days * 24 * 60 * 60 * 1000;
  const offset = Math.floor(Math.random() * range);
  return new Date(now - offset).toISOString();
}

export function seedCandidates(count = 60): Candidate[] {
  const candidates: Candidate[] = [];
  const stageBuckets = stages.map((stage) => ({ stage, items: [] as Candidate[] }));

  for (let i = 0; i < count; i += 1) {
    const first = randomItem(firstNames);
    const last = randomItem(lastNames);
    const name = `${first} ${last}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${
      Math.floor(Math.random() * 90) + 10
    }@gmail.com`;
    const pool = randomItem(pools);
    const stage = randomItem(stages);

    const candidate: Candidate = {
      id: crypto.randomUUID(),
      name,
      email,
      phone: `+370 ${Math.floor(Math.random() * 9000000 + 1000000)}`,
      avatar_url: null,
      pipeline_id: "mailerlite",
      pool_id: pool.id,
      stage_id: stage.id,
      status: "active",
      created_at: randomDateWithin(30),
      updated_at: new Date().toISOString(),
      order: 0,
      source: randomItem(sources),
    };

    stageBuckets.find((bucket) => bucket.stage.id === stage.id)?.items.push(candidate);
  }

  stageBuckets.forEach((bucket) => {
    bucket.items
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .forEach((candidate, index) => {
        candidate.order = index;
        candidates.push(candidate);
      });
  });

  return candidates;
}
