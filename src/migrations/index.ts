import * as migration_20260821_113431_initial_blog_four_locales from './20260821_113431_initial_blog_four_locales';
import * as migration_20260902_085431_add_fr_locale from './20260902_085431_add_fr_locale';

export const migrations = [
  {
    up: migration_20260821_113431_initial_blog_four_locales.up,
    down: migration_20260821_113431_initial_blog_four_locales.down,
    name: '20260821_113431_initial_blog_four_locales',
  },
  {
    up: migration_20260902_085431_add_fr_locale.up,
    down: migration_20260902_085431_add_fr_locale.down,
    name: '20260902_085431_add_fr_locale'
  },
];
