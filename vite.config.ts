import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
		},
    fs: {
      allow: ['legacy'] // Allow serving files from legacy if needed (e.g. models)
    }
	},
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'onnxruntime-web']
  }
});
