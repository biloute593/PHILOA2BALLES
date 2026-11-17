import type { Episode } from '../types/podcast';
import { EPISODES_13_15 } from './episodes/ep13_15';
import { EPISODES_16_17 } from './episodes/ep16_17';

export const SONG_EPISODES: Episode[] = [...EPISODES_13_15, ...EPISODES_16_17];
