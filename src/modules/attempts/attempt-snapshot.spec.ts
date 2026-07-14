import { toSafeAttemptQuestion } from './attempt-snapshot';

describe('attempt snapshot projections', () => {
  it('projects only user-safe question fields', () => {
    const projected = toSafeAttemptQuestion({
      id: '8b2766fc-6868-4f57-8d64-488843c3eddd',
      position: 1,
      questionText: 'Which status code means Not Found?',
      options: ['200', '404'],
      correctOptionIndex: 1,
    });

    expect(projected).toEqual({
      id: '8b2766fc-6868-4f57-8d64-488843c3eddd',
      position: 1,
      questionText: 'Which status code means Not Found?',
      options: ['200', '404'],
    });
    expect(projected).not.toHaveProperty('correctOptionIndex');
  });
});
