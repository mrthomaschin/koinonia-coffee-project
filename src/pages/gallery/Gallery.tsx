import React, { useEffect, useState } from 'react';
import SEO from '../../components/SEO';
import './Gallery.css';

const Gallery: React.FC = () => {
  const [photos, setPhotos] = useState<string[]>([]);
  const [landscapePhotos, setLandscapePhotos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/assets/images/gallery/gallery-images.json')
      .then((response) => response.ok ? response.json() : [])
      .then((images: unknown) => setPhotos(Array.isArray(images) ? images.filter((image): image is string => typeof image === 'string') : []))
      .catch(() => setPhotos([]));
  }, []);

  return <main className="gallery-page">
    <SEO
      title="Koinonia Coffee Project | Gallery"
      description="A few moments from Koinonia Coffee Project."
      path="/gallery"
    />
    <header className="gallery-heading">
      <h1>Gallery</h1>
    </header>
    <section className="gallery-photos" aria-label="Koinonia Coffee Project photos">
      {photos.map((photo, index) => (
        <figure className={`gallery-photo${landscapePhotos[photo] ? ' gallery-photo--landscape' : ''}`} key={photo}>
          <img
            src={`/assets/images/gallery/${photo}`}
            alt={`Koinonia Coffee Project moment ${index + 1}`}
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              setLandscapePhotos((current) => ({
                ...current,
                [photo]: naturalWidth > naturalHeight,
              }));
            }}
          />
        </figure>
      ))}
    </section>
  </main>;
};

export default Gallery;
