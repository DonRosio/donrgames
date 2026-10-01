import { bluffContract } from '@mini-jeux/shared/games/bluff';
import type {
  BluffContract,
  BluffView,
  RevealOption,
  VoteOption,
} from '@mini-jeux/shared/games/bluff';
import { POINTS_PER_FOOLED, POINTS_REAL_VOTE } from '@mini-jeux/shared/games/bluff-themes';
import { defineGame } from '../../core/engine/types.ts';
import type { GameContext } from '../../core/engine/types.ts';
import { answerKey, cleanAnswer, isRealAnswer, isValidAnswer } from './answers.ts';
import { QUESTIONS } from './questions/index.ts';
import type { Question } from './questions/index.ts';

/** An answer to choose from: written by one or several players (merged), or the real one. */
interface Option {
  id: string;
  text: string;
  authors: string[];
  real: boolean;
}

export interface BluffState {
  /** The questions of this game, in the order they are asked. */
  questions: Question[];
  index: number;
  /** Total of every participant. */
  scores: Map<string, number>;
  /** Current question: false answers by player (cleaned), options once voting opens, votes. */
  answers: Map<string, string>;
  options: Option[];
  votes: Map<string, string>;
  /** Points won on the current question. */
  gains: Map<string, number>;
}

type Ctx = GameContext<BluffContract>;

const current = (state: BluffState): Question => state.questions[state.index]!;

/** Everything the game waits for is done by every player it waits for (and there is one). */
function everyoneDone(
  done: ReadonlyMap<string, unknown>,
  ctx: { players: Ctx['players'] },
): boolean {
  const awaited = ctx.players.awaited();
  return awaited.length > 0 && awaited.every((id) => done.has(id));
}

/**
 * Mixes the false answers with the real one, under identifiers that tell nothing. Players who
 * wrote the same answer (once normalized) share one option.
 */
function buildOptions(state: BluffState, ctx: Ctx): Option[] {
  const grouped = new Map<string, Option>();
  for (const [player, text] of state.answers) {
    const key = answerKey(text);
    const option = grouped.get(key);
    if (option) option.authors.push(player);
    else grouped.set(key, { id: '', text, authors: [player], real: false });
  }
  const real: Option = { id: '', text: current(state).answer, authors: [], real: true };
  const mixed = ctx.random.shuffle([...grouped.values(), real]);
  return mixed.map((option, i) => ({ ...option, id: `o${i + 1}` }));
}

function scoreQuestion(state: BluffState): void {
  state.gains = new Map();
  const earn = (player: string, points: number) =>
    state.gains.set(player, (state.gains.get(player) ?? 0) + points);
  for (const [voter, optionId] of state.votes) {
    const option = state.options.find((candidate) => candidate.id === optionId);
    if (!option) continue;
    if (option.real) earn(voter, POINTS_REAL_VOTE);
    for (const author of option.authors) earn(author, POINTS_PER_FOOLED);
  }
  for (const [player, points] of state.gains) {
    state.scores.set(player, (state.scores.get(player) ?? 0) + points);
  }
}

export const bluffGame = defineGame({
  contract: bluffContract,
  setup: (ctx, { players, settings }): BluffState => {
    const themes: readonly string[] = settings.themes;
    const pool = QUESTIONS.filter((question) => themes.includes(question.theme));
    return {
      questions: ctx.random.shuffle(pool).slice(0, settings.rounds),
      index: 0,
      scores: new Map(players.map((id) => [id, 0])),
      answers: new Map(),
      options: [],
      votes: new Map(),
      gains: new Map(),
    };
  },
  initialPhase: 'writing',
  phases: {
    writing: {
      actions: ['answer'],
      next: ['voting'],
      enter(state) {
        state.answers = new Map();
        state.options = [];
        state.votes = new Map();
        state.gains = new Map();
      },
      on: {
        answer(state, ctx, from, { text }) {
          if (state.answers.has(from)) ctx.reject('ALREADY_ANSWERED');
          const cleaned = cleanAnswer(text);
          if (!isValidAnswer(cleaned)) ctx.reject('ANSWER_INVALID');
          const question = current(state);
          if (isRealAnswer(cleaned, [question.answer, ...question.accept])) {
            ctx.reject('ANSWER_IS_REAL');
          }
          state.answers.set(from, cleaned);
          if (everyoneDone(state.answers, ctx)) ctx.goto('voting');
        },
      },
    },
    voting: {
      actions: ['vote'],
      next: ['reveal'],
      enter(state, ctx) {
        state.options = buildOptions(state, ctx);
      },
      on: {
        vote(state, ctx, from, { option }) {
          if (state.votes.has(from)) ctx.reject('ALREADY_VOTED');
          const chosen = state.options.find((candidate) => candidate.id === option);
          if (!chosen || chosen.authors.includes(from)) ctx.reject('BAD_OPTION');
          state.votes.set(from, option);
          if (everyoneDone(state.votes, ctx)) ctx.goto('reveal');
        },
      },
    },
    reveal: {
      actions: ['next'],
      next: ['writing'],
      enter(state) {
        scoreQuestion(state);
      },
      on: {
        next(state, ctx) {
          if (state.index + 1 >= state.questions.length) {
            ctx.end([...state.scores].map(([playerId, score]) => ({ playerId, score })));
            return;
          }
          state.index++;
          ctx.goto('writing');
        },
      },
    },
  },
  view(state, viewer, ctx): BluffView {
    const question = current(state);
    const base = {
      players: [...state.scores.keys()],
      index: state.index + 1,
      count: state.questions.length,
      theme: question.theme,
      question: question.text,
    };
    if (ctx.phase === 'writing') {
      return {
        ...base,
        phase: 'writing',
        answered: [...state.answers.keys()],
        mine: state.answers.get(viewer) ?? null,
      };
    }
    if (ctx.phase === 'voting') {
      const options: VoteOption[] = state.options.map((option) => ({
        id: option.id,
        text: option.text,
        mine: option.authors.includes(viewer),
      }));
      return {
        ...base,
        phase: 'voting',
        options,
        voted: [...state.votes.keys()],
        myVote: state.votes.get(viewer) ?? null,
      };
    }
    const options: RevealOption[] = state.options.map((option) => ({
      id: option.id,
      text: option.text,
      real: option.real,
      authors: option.authors,
      voters: [...state.votes].filter(([, id]) => id === option.id).map(([voter]) => voter),
    }));
    return {
      ...base,
      phase: 'reveal',
      answer: question.answer,
      options,
      gains: Object.fromEntries(state.gains),
      scores: Object.fromEntries(state.scores),
      last: state.index + 1 >= state.questions.length,
    };
  },
  onSkip(state, ctx) {
    if (ctx.phase === 'writing') ctx.goto('voting');
    else if (ctx.phase === 'voting') ctx.goto('reveal');
  },
  onPlayerChange(state, ctx, change) {
    if (change.kind !== 'unawaited' && change.kind !== 'left') return;
    if (ctx.phase === 'writing' && everyoneDone(state.answers, ctx)) ctx.goto('voting');
    if (ctx.phase === 'voting' && everyoneDone(state.votes, ctx)) ctx.goto('reveal');
  },
});
