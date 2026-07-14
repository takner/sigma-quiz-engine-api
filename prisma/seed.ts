import { PrismaClient, QuizStatus, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const demoQuestions = [
  {
    position: 1,
    questionText: 'Which HTTP status code means Not Found?',
    options: ['200', '201', '404', '500'],
    correctOptionIndex: 2,
  },
  {
    position: 2,
    questionText: 'Which HTTP method retrieves a resource?',
    options: ['POST', 'GET', 'PATCH', 'DELETE'],
    correctOptionIndex: 1,
  },
  {
    position: 3,
    questionText: 'Which layer validates JWT roles in this API?',
    options: ['Controller guard', 'Database migration', 'Docker healthcheck'],
    correctOptionIndex: 0,
  },
  {
    position: 4,
    questionText: 'What happens to published quiz content?',
    options: [
      'It remains immutable',
      'It is deleted nightly',
      'It is edited by users',
    ],
    correctOptionIndex: 0,
  },
  {
    position: 5,
    questionText: 'Where is the attempt scoring source stored?',
    options: ['Attempt snapshot', 'Browser storage', 'Swagger description'],
    correctOptionIndex: 0,
  },
];

async function main(): Promise<void> {
  const admin = await upsertUser(
    process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
    process.env.SEED_ADMIN_PASSWORD ?? 'AdminDemoPass123!',
    UserRole.ADMIN,
  );
  await upsertUser(
    process.env.SEED_USER_EMAIL ?? 'user@example.com',
    process.env.SEED_USER_PASSWORD ?? 'UserDemoPass123!',
    UserRole.USER,
  );

  const publishedQuiz = await upsertQuiz('Demo Published Quiz', {
    description: 'A seeded quiz for local development and smoke testing.',
    status: QuizStatus.PUBLISHED,
    timeLimitSeconds: 900,
    createdById: admin.id,
    publishedAt: new Date(),
    archivedAt: null,
  });

  for (const question of demoQuestions) {
    await prisma.question.upsert({
      where: {
        quizId_position: {
          quizId: publishedQuiz.id,
          position: question.position,
        },
      },
      update: {
        questionText: question.questionText,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
      },
      create: {
        quizId: publishedQuiz.id,
        position: question.position,
        questionText: question.questionText,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
      },
    });
  }

  await upsertQuiz('Demo Draft Quiz', {
    description: 'A seeded draft quiz for admin lifecycle testing.',
    status: QuizStatus.DRAFT,
    timeLimitSeconds: null,
    createdById: admin.id,
    publishedAt: null,
    archivedAt: null,
  });
}

async function upsertUser(
  email: string,
  password: string,
  role: UserRole,
): Promise<{ id: string }> {
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { passwordHash, role },
    create: {
      email: normalizedEmail,
      passwordHash,
      role,
    },
    select: { id: true },
  });
}

async function upsertQuiz(
  title: string,
  data: {
    description: string;
    status: QuizStatus;
    timeLimitSeconds: number | null;
    createdById: string;
    publishedAt: Date | null;
    archivedAt: Date | null;
  },
): Promise<{ id: string }> {
  const existing = await prisma.quiz.findFirst({
    where: { title },
    select: { id: true, publishedAt: true },
  });

  if (!existing) {
    return prisma.quiz.create({
      data: {
        title,
        ...data,
      },
      select: { id: true },
    });
  }

  return prisma.quiz.update({
    where: { id: existing.id },
    data: {
      title,
      description: data.description,
      status: data.status,
      timeLimitSeconds: data.timeLimitSeconds,
      createdById: data.createdById,
      publishedAt:
        data.status === QuizStatus.PUBLISHED
          ? (existing.publishedAt ?? data.publishedAt)
          : null,
      archivedAt: data.archivedAt,
    },
    select: { id: true },
  });
}

void main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
