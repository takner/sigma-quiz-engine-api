import { ApplicationException } from '../../common/errors/application.exception';
import { AttemptSnapshot } from './attempt-snapshot';
import { scoreAttemptAnswers } from './attempt-scoring';

describe('attempt scoring', () => {
  const snapshot: AttemptSnapshot = {
    questions: [
      {
        id: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
        position: 1,
        questionText: 'First question?',
        options: ['A', 'B'],
        correctOptionIndex: 1,
      },
      {
        id: 'af8dce8e-bc68-4f8e-a781-c42dbd7bb2c6',
        position: 2,
        questionText: 'Second question?',
        options: ['A', 'B', 'C'],
        correctOptionIndex: 0,
      },
    ],
  };

  it('scores partial submissions and includes omitted questions in the breakdown', () => {
    const result = scoreAttemptAnswers(snapshot, [
      {
        questionId: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
        selectedOptionIndex: 1,
      },
    ]);

    expect(result.score).toEqual({
      correct: 1,
      total: 2,
      percentage: 50,
    });
    expect(result.rows).toEqual([
      {
        questionId: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
        selectedOptionIndex: 1,
        isCorrect: true,
      },
    ]);
    expect(result.breakdown).toEqual([
      {
        questionId: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
        selectedOptionIndex: 1,
        answered: true,
        isCorrect: true,
      },
      {
        questionId: 'af8dce8e-bc68-4f8e-a781-c42dbd7bb2c6',
        selectedOptionIndex: null,
        answered: false,
        isCorrect: false,
      },
    ]);
  });

  it('rejects duplicate question answers', () => {
    expect(() =>
      scoreAttemptAnswers(snapshot, [
        {
          questionId: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
          selectedOptionIndex: 1,
        },
        {
          questionId: '12a79c3f-4790-4260-a595-a42ea8f01ad8',
          selectedOptionIndex: 0,
        },
      ]),
    ).toThrow(ApplicationException);
  });
});
