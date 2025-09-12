export function mapUserAspectRatio(value) {
  // value 예: '가로 (16:9)', '세로 (9:16)', '정사각형 (1:1)'
  if (!value) return 'widescreen_16_9';
  if (value.includes('16:9')) return 'widescreen_16_9';
  if (value.includes('9:16')) return 'vertical_9_16';
  if (value.includes('1:1')) return 'square_1_1';
  return 'widescreen_16_9';
}
