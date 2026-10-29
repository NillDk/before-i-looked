import { configDefaults, defineConfig } from 'vitest/config';

// Agent worktrees live in .claude/worktrees; their copies of test/ are not this checkout's tests.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
