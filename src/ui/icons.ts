import type { SymbolViewProps } from 'expo-symbols';

type Name = SymbolViewProps['name'];
const i = (ios: string, md: string): Name => ({ ios, android: md, web: md }) as Name;

export const IC = {
  home: i('house.fill', 'home'),
  workout: i('dumbbell.fill', 'fitness_center'),
  history: i('calendar', 'calendar_month'),
  plan: i('list.bullet.rectangle', 'list_alt'),
  settings: i('gearshape.fill', 'settings'),
  add: i('plus', 'add'),
  minus: i('minus', 'remove'),
  check: i('checkmark', 'check'),
  close: i('xmark', 'close'),
  timer: i('timer', 'timer'),
  pause: i('pause.fill', 'pause'),
  play: i('play.fill', 'play_arrow'),
  skip: i('forward.end.fill', 'skip_next'),
  share: i('square.and.arrow.up', 'share'),
  trash: i('trash', 'delete'),
  edit: i('pencil', 'edit'),
  chevron: i('chevron.right', 'chevron_right'),
  bolt: i('bolt.fill', 'bolt'),
  trophy: i('trophy.fill', 'emoji_events'),
  sparkles: i('sparkles', 'auto_awesome'),
  link: i('link', 'link'),
  search: i('magnifyingglass', 'search'),
};
