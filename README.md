# Koinonia Coffee Project

A React web application for Koinonia Coffee - cultivating community, one cup at a time.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase CLI (for deployment)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000).

### Available Scripts

- `npm start` - Runs the app in development mode
- `npm build` - Builds the app for production to the `build` folder
- `npm test` - Launches the test runner
- `npm eject` - Ejects from Create React App (one-way operation)

## Project Structure

```
src/
├── components/       # Reusable UI components (AppBar, BottomBar, ComingSoon)
├── pages/           # Page components (Homepage, Contact)
├── contexts/        # React Context providers for state management
├── constants.js     # App-wide constants (colors, fonts, assets)
├── App.js          # Main application component
└── index.js        # Application entry point

public/
├── assets/         # Static assets (fonts, images, logos, icons)
└── index.html      # HTML template
```

## Features

- **Homepage**: Hero section with brand messaging and company description
- **Contact Page**: Contact form with validation (email integration pending)
- **Navigation**: Responsive navigation with mobile menu
- **Coming Soon Pages**: Placeholder pages for Menu, About, Blog, Gallery, and Events
- **Responsive Design**: Mobile-first design with breakpoints at 768px and 1024px

## Firebase Deployment

1. Build the production version:
```bash
npm run build
```

2. Deploy to Firebase Hosting:
```bash
firebase deploy
```

The app will be deployed to your Firebase hosting URL.

## Technologies Used

- **React 18** - UI library
- **Create React App** - Build tooling
- **React Context + Hooks** - State management
- **CSS3** - Styling
- **Firebase Hosting** - Deployment platform

## Custom Fonts

The project uses custom fonts located in `public/assets/fonts/`:
- HedvigLettersSerif_18pt - Primary headings
- ShipporiAntiqueB1 - Navigation and buttons
- Besley-Italic - Secondary text
- RethinkSans-Regular - Body text

## Contact

Email: hello@koinoniacoffeeproject.com  
Instagram: [@koinoniacoffeeproject](https://www.instagram.com/koinoniacoffeeproject)
