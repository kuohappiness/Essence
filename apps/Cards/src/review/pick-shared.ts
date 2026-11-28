import type { Rating } from '../core/study/index.ts';

// 點選填空的兩條作答流程共用的（pick.ts 一格一個字、pick-many.ts 一列可以放好幾個）：防點錯的時間、評分的先後、回看能改成的評分。

/** 同一個字連點，這麼久之內不算（規畫〈畫面與防點錯〉）。 */
export const SAME_KEY = 300;
/** 最後一次填字之後，這麼久之內的「對答案」不算：手順勢多按一下。 */
export const AFTER_FILL = 350;

export const RANK: Record<Rating, number> = { miss: 0, near: 1, good: 2, easy: 3 };
export const ALL_RIGHT: readonly Rating[] = ['good', 'easy'];
export const NONE: readonly Rating[] = [];

/** 回看能改成的評分（§8 💡）：孩子自己選的才能改，程式判的不能改。要換做法只改這裡。 */
export const changeable = (allRight: boolean): readonly Rating[] => allRight ? ALL_RIGHT : NONE;
