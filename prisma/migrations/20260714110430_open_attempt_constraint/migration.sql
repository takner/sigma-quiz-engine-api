CREATE UNIQUE INDEX "QuizAttempt_one_open_per_user_quiz"
ON "QuizAttempt" ("userId", "quizId")
WHERE "status" = 'IN_PROGRESS';
