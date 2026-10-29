import { incognitoContract } from '@mini-jeux/shared/games/incognito';
import type {
  Alias,
  ChatRound,
  IncognitoContract,
  IncognitoView,
  Person,
  RevealedPair,
} from '@mini-jeux/shared/games/incognito';
import { ALIAS_NAMES, NOTE_MAX_LENGTH, plainName } from '@mini-jeux/shared/games/incognito-data';
import { Barrier } from '../../core/engine/helpers.ts';
import { defineGame } from '../../core/engine/types.ts';
import type { GameContext } from '../../core/engine/types.ts';

export interface IncognitoState {
  /** First names of the game, in display order (ids a0, a1…). */
  aliases: Alias[];
  /** Who is behind which first name: the secret of the game, never sent before the reveal. */
  aliasOf: Map<string, string>;
  playerOf: Map<string, string>;
  /** Players of the game, in the order shown in the matching (unrelated to the first names). */
  people: string[];
  /** Questions of the game, already drawn (random, no repeat in the room). */
  questions: string[];
  /** 0-based index of the current question. */
  index: number;
  /** Answers received, by question, in arrival order. */
  rounds: { alias: string; text: string }[][];
  /** Private notes: player → first name → text. */
  notes: Map<string, Map<string, string>>;
  /** Matching of each player: first name → person. Never contains the player's own first name. */
  guesses: Map<string, Map<string, string>>;
  confirmed: Barrier;
  /** Order in which the persons are unmasked, and how many already are. */
  order: string[];
  shown: number;
}

type Ctx = GameContext<IncognitoContract>;

const aliasOfPlayer = (state: IncognitoState, player: string) => state.aliasOf.get(player)!;

/** Draws the questions of the game among those not asked yet in the room. */
function drawQuestions(ctx: Ctx, count: number): string[] {
  const questions: string[] = [];
  while (questions.length < count) {
    const item = ctx.content.pick();
    if (!item) break;
    ctx.content.markPlayed(item.id);
    questions.push(item.title);
  }
  return questions;
}

/** First names for `count` players, none looking like a nickname of the room (it would confuse). */
function drawNames(ctx: Ctx, count: number): string[] {
  const taken = new Set(ctx.players.all().map((player) => plainName(player.nickname)));
  const free = ALIAS_NAMES.filter((name) => !taken.has(plainName(name)));
  return ctx.random.shuffle(free).slice(0, count);
}

function questionDone(state: IncognitoState, ctx: Ctx): boolean {
  const awaited = ctx.players.awaited();
  const answered = new Set(state.rounds[state.index]?.map((entry) => entry.alias));
  return awaited.length > 0 && awaited.every((id) => answered.has(aliasOfPlayer(state, id)));
}

/** Next question, or the matching after the last one. */
function nextQuestion(state: IncognitoState, ctx: Ctx): void {
  state.index++;
  if (state.index >= state.questions.length) {
    ctx.goto('matching');
    return;
  }
  state.rounds.push([]);
}

function allConfirmed(state: IncognitoState, ctx: Ctx): boolean {
  return state.confirmed.isComplete(ctx.players.awaited());
}

/** Players (other than the person) who linked this first name to this person. */
function foundBy(state: IncognitoState, person: string): string[] {
  const alias = aliasOfPlayer(state, person);
  return state.people.filter(
    (player) => player !== person && state.guesses.get(player)?.get(alias) === person,
  );
}

/** Correct links among the first `count` persons unmasked. */
function scoreOf(state: IncognitoState, player: string, count: number): number {
  return state.order.slice(0, count).filter((person) => foundBy(state, person).includes(player))
    .length;
}

function scores(state: IncognitoState, count: number) {
  return state.people.map((playerId) => ({ playerId, score: scoreOf(state, playerId, count) }));
}

function peopleOf(state: IncognitoState, ctx: { players: Ctx['players'] }): Person[] {
  return state.people.map((id) => ({ id, nickname: ctx.players.get(id)?.nickname ?? '?' }));
}

function roundsOf(state: IncognitoState, upTo: number): ChatRound[] {
  return state.rounds.slice(0, upTo + 1).map((answers, index) => ({
    question: state.questions[index]!,
    answers: answers.map((answer) => ({ ...answer })),
  }));
}

const record = <V>(map: Map<string, V> | undefined): Record<string, V> =>
  Object.fromEntries(map ?? []);

export const incognitoGame = defineGame({
  contract: incognitoContract,
  content: 'text',
  setup: (ctx, { players, settings }): IncognitoState => {
    const questions = drawQuestions(ctx, settings.questions);
    const names = drawNames(ctx, players.length);
    const aliases = names.map((name, slot) => ({ id: `a${slot}`, name, slot }));
    // The first names are dealt to a random permutation of the players, and the matching lists
    // them in another one: neither order reveals anything.
    const dealt = ctx.random.shuffle(players);
    const aliasOf = new Map(dealt.map((player, slot) => [player, aliases[slot]!.id]));
    return {
      aliases,
      aliasOf,
      playerOf: new Map([...aliasOf].map(([player, alias]) => [alias, player])),
      people: ctx.random.shuffle(players),
      questions,
      index: 0,
      rounds: [[]],
      notes: new Map(),
      guesses: new Map(),
      confirmed: new Barrier(),
      order: [],
      shown: 0,
    };
  },
  initialPhase: 'chat',
  phases: {
    chat: {
      actions: ['answer', 'note'],
      next: ['matching'],
      on: {
        answer(state, ctx, from, { question, text }) {
          if (question !== state.index + 1) ctx.reject('STALE_QUESTION');
          const alias = aliasOfPlayer(state, from);
          if (state.rounds[state.index]!.some((entry) => entry.alias === alias)) {
            ctx.reject('ALREADY_ANSWERED');
          }
          state.rounds[state.index]!.push({ alias, text });
          if (questionDone(state, ctx)) nextQuestion(state, ctx);
        },
        note: (state, ctx, from, payload) => saveNote(state, ctx, from, payload),
      },
    },
    matching: {
      actions: ['note', 'guess', 'confirm'],
      next: ['reveal'],
      on: {
        note: (state, ctx, from, payload) => saveNote(state, ctx, from, payload),
        guess(state, ctx, from, { links }) {
          if (state.confirmed.has(from)) ctx.reject('ALREADY_CONFIRMED');
          const mine = aliasOfPlayer(state, from);
          const aliases = new Set<string>();
          const persons = new Set<string>();
          for (const link of links) {
            if (!state.playerOf.has(link.alias)) ctx.reject('UNKNOWN_ALIAS');
            if (!state.aliasOf.has(link.player)) ctx.reject('UNKNOWN_PLAYER');
            // One link per first name and per person, and never one's own.
            if (link.alias === mine || link.player === from) ctx.reject('BAD_GUESS');
            if (aliases.has(link.alias) || persons.has(link.player)) ctx.reject('BAD_GUESS');
            aliases.add(link.alias);
            persons.add(link.player);
          }
          state.guesses.set(from, new Map(links.map((link) => [link.alias, link.player])));
        },
        confirm(state, ctx, from) {
          if (state.confirmed.has(from)) ctx.reject('ALREADY_CONFIRMED');
          if ((state.guesses.get(from)?.size ?? 0) < state.people.length - 1) {
            ctx.reject('GUESS_INCOMPLETE');
          }
          state.confirmed.mark(from);
          if (allConfirmed(state, ctx)) ctx.goto('reveal');
        },
      },
    },
    reveal: {
      actions: ['next'],
      next: [],
      enter(state, ctx) {
        state.order = ctx.random.shuffle(state.people);
        state.shown = 0;
      },
      on: {
        next(state, ctx) {
          if (state.shown < state.people.length) {
            state.shown++;
            return;
          }
          ctx.end(scores(state, state.people.length));
        },
      },
    },
  },
  view(state, viewer, ctx): IncognitoView {
    const me = aliasOfPlayer(state, viewer);
    const notes = record(state.notes.get(viewer));
    switch (ctx.phase) {
      case 'chat':
        return {
          phase: 'chat',
          me,
          aliases: state.aliases,
          index: state.index + 1,
          total: state.questions.length,
          rounds: roundsOf(state, state.index),
          answered: state.rounds[state.index]!.map((entry) => entry.alias),
          notes,
        };
      case 'matching':
        return {
          phase: 'matching',
          me,
          aliases: state.aliases,
          people: peopleOf(state, ctx),
          rounds: roundsOf(state, state.questions.length - 1),
          notes,
          links: record(state.guesses.get(viewer)),
          confirmed: state.confirmed.has(viewer),
          confirmedBy: state.confirmed.ids,
        };
      default: {
        const pairs: RevealedPair[] = state.order.slice(0, state.shown).map((person) => ({
          person,
          alias: aliasOfPlayer(state, person),
          foundBy: foundBy(state, person),
        }));
        return {
          phase: 'reveal',
          me,
          aliases: state.aliases,
          people: peopleOf(state, ctx),
          pairs,
          myLinks: record(state.guesses.get(viewer)),
          scores: scores(state, state.shown),
        };
      }
    }
  },
  onSkip(state, ctx) {
    if (ctx.phase === 'chat') nextQuestion(state, ctx);
    else if (ctx.phase === 'matching') ctx.goto('reveal');
  },
  onPlayerChange(state, ctx, change) {
    if (change.kind !== 'unawaited' && change.kind !== 'left') return;
    if (ctx.phase === 'chat' && questionDone(state, ctx)) nextQuestion(state, ctx);
    else if (ctx.phase === 'matching' && allConfirmed(state, ctx)) ctx.goto('reveal');
  },
});

/** A private note about a first name (empty text erases it). Never about one's own. */
function saveNote(
  state: IncognitoState,
  ctx: Ctx,
  from: string,
  { alias, text }: { alias: string; text: string },
): void {
  if (!state.playerOf.has(alias)) ctx.reject('UNKNOWN_ALIAS');
  if (alias === aliasOfPlayer(state, from)) ctx.reject('OWN_ALIAS');
  const notes = state.notes.get(from) ?? new Map<string, string>();
  const clean = text.slice(0, NOTE_MAX_LENGTH);
  if (clean === '') notes.delete(alias);
  else notes.set(alias, clean);
  state.notes.set(from, notes);
}
