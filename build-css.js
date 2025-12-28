import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, 'public', 'styles.css');
const outputFile = path.join(__dirname, 'public', 'dist', 'styles.css');

// Ensure output directory exists
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const css = fs.readFileSync(inputFile, 'utf8');

postcss([tailwindcss, autoprefixer])
  .process(css, { from: inputFile, to: outputFile })
  .then((result) => {
    fs.writeFileSync(outputFile, result.css);
    if (result.map) {
      fs.writeFileSync(outputFile + '.map', result.map.toString());
    }
    console.log('✅ Tailwind CSS compiled successfully!');
  })
  .catch((error) => {
    console.error('❌ Error compiling Tailwind CSS:', error);
    process.exit(1);
  });

