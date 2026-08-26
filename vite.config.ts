import { defineConfig } from 'vite';

// Repository name doubles as the GitHub Pages sub-path.
export default defineConfig( {
	base: process.env.GITHUB_ACTIONS ? '/block-pattern-diff/' : '/',
} );
