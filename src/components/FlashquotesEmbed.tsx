import React from "react";
import trackingService from "../services/trackingService";

export class FlashquotesEmbed extends React.Component {
  private readonly iframeContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            margin: 0; 
            padding: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        </style>
      </head>
      <body>
        <script form-id="cmmbfjpjh0001jr045oua4csa" src="https://app.flashquotes.com/embed.js"></script>
      </body>
    </html>
  `;

  private readonly iframeRef = React.createRef<HTMLIFrameElement>();
  private formStarted = false;

  // Submissions happen inside Flashquotes' cross-origin frame, so the closest
  // signal we can see is the visitor clicking into the form, which moves
  // focus from this window to the iframe.
  private handleWindowBlur = () => {
    if (this.formStarted) {
      return;
    }
    window.setTimeout(() => {
      if (document.activeElement === this.iframeRef.current) {
        this.formStarted = true;
        trackingService.trackEvent("quote_form_start", {
          page_path: window.location.pathname,
        });
      }
    });
  };

  componentDidMount() {
    window.addEventListener("blur", this.handleWindowBlur);
  }

  componentWillUnmount() {
    window.removeEventListener("blur", this.handleWindowBlur);
  }

  render() {
    return (
      <iframe
        ref={this.iframeRef}
        srcDoc={this.iframeContent}
        style={{
          width: "100%",
          height: "80vh",
          border: "none",
          borderRadius: "8px",
        }}
        title="Flashquotes Form"
      />
    );
  }
}
