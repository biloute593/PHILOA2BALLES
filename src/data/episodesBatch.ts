import type { Episode } from '../types/podcast';
import { EPISODES_01_03 } from './episodes/ep01_03';
import { EPISODES_04_06 } from './episodes/ep04_06';
import { EPISODES_07_09 } from './episodes/ep07_09';
import { EPISODES_10_12 } from './episodes/ep10_12';

export const SEASON_1_EPISODES: Episode[] = [
  ...EPISODES_01_03,
  ...EPISODES_04_06,
  ...EPISODES_07_09,
  ...EPISODES_10_12,
];
