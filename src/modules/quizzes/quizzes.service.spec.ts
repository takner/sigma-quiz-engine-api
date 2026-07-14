import { ApplicationException } from '../../common/errors/application.exception';
import { normalizeQuestionInput } from './quizzes.service';

describe('normalizeQuestionInput', () => {
  it('trims valid options and preserves the correct option index', () => {
    expect(
      normalizeQuestionInput({
        position: 1,
        questionText: ' Which runtime is selected? ',
        options: [' Node.js ', 'Deno'],
        correctOptionIndex: 0,
      }),
    ).toEqual({
      position: 1,
      questionText: 'Which runtime is selected?',
      options: ['Node.js', 'Deno'],
      correctOptionIndex: 0,
    });
  });

  it('rejects duplicate or blank options', () => {
    expect(() =>
      normalizeQuestionInput({
        position: 1,
        questionText: 'Which option is duplicated?',
        options: ['Node', ' node '],
        correctOptionIndex: 0,
      }),
    ).toThrow(ApplicationException);

    expect(() =>
      normalizeQuestionInput({
        position: 1,
        questionText: 'Which option is blank?',
        options: ['Node', '   '],
        correctOptionIndex: 0,
      }),
    ).toThrow(ApplicationException);
  });

  it('rejects a correct option index outside the options array', () => {
    expect(() =>
      normalizeQuestionInput({
        position: 1,
        questionText: 'Which index is invalid?',
        options: ['A', 'B'],
        correctOptionIndex: 2,
      }),
    ).toThrow(ApplicationException);
  });
});
