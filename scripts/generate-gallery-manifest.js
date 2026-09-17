const fs = require('fs');
const path = require('path');

const galleryDirectory = path.join(__dirname, '..', 'public', 'assets', 'images', 'gallery');
const manifestPath = path.join(galleryDirectory, 'gallery-images.json');
const supportedImage = /\.(avif|gif|jpe?g|png|webp)$/i;

const images = fs.readdirSync(galleryDirectory)
  .filter((filename) => supportedImage.test(filename))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

fs.writeFileSync(manifestPath, `${JSON.stringify(images, null, 2)}\n`);
