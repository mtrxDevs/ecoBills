
    window.dataLayer = window.dataLayer || [];

    function glueCookieNotificationBarLoaded() {
      // GTM BOOTSTRAP CODE
      (function (w, d, s, l, i) {
        w[l] = w[l] || []; w[l].push({
          'gtm.start':
            new Date().getTime(), event: 'gtm.js'
        }); var f = d.getElementsByTagName(s)[0],
          j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : ''; j.async = true; j.src =
            'https://www.googletagmanager.com/gtm.js?id=' + i + dl; f.parentNode.insertBefore(j, f);
      })(window, document, 'script', 'dataLayer', 'GTM-M4N2ZKXQ');
    }
  


  if (!window.ModalYoutubeHelper) {
    window.ModalYoutubeHelper = class ModalYoutubeHelper {
      constructor(dialog) {
        this.dialog = dialog;
        this.body = dialog.querySelector('[data-body]');
        this.youtubeUrl = dialog.getAttribute('data-youtube-url') || '';

        const closeButtons = dialog.querySelectorAll('[data-close-btn]');
        closeButtons.forEach((btn) => {
          btn.addEventListener('click', () => this.close());
        });

        this.dialog.addEventListener('close', () => {
          this.dialog.classList.remove('active');
          this.body.innerHTML = '';
        });
      }

      setUrl(url) {
        this.youtubeUrl = url;
      }

      sanitizeUrl(url) {
        let urlToSanitize = url;
        if (urlToSanitize.includes('watch?v=')) {
          const videoId = urlToSanitize.split('v=')[1].split('&')[0];
          urlToSanitize = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0`;
        } else if (urlToSanitize.includes('youtube.com/embed/')) {
          const separator = urlToSanitize.includes('?') ? '&' : '?';
          if (!urlToSanitize.includes('autoplay=')) {
            urlToSanitize += `${separator}autoplay=1&mute=0`;
          }
        }
        return urlToSanitize;
      }

      show(url) {
        if (url) {
          this.youtubeUrl = url;
        }
        if (!this.youtubeUrl) return;

        const sanitized = this.sanitizeUrl(this.youtubeUrl);
        this.body.innerHTML = `
          <iframe width="100%" height="100%" src="${sanitized}" title="YouTube video player" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        `;

        this.dialog.showModal();
        setTimeout(() => {
          this.dialog.classList.add('active');
        }, 50);
      }

      close() {
        this.dialog.close();
      }
    };
  }



  if (!window.ModalYoutubeHelper) {
    window.ModalYoutubeHelper = class ModalYoutubeHelper {
      constructor(dialog) {
        this.dialog = dialog;
        this.body = dialog.querySelector('[data-body]');
        this.youtubeUrl = dialog.getAttribute('data-youtube-url') || '';

        const closeButtons = dialog.querySelectorAll('[data-close-btn]');
        closeButtons.forEach((btn) => {
          btn.addEventListener('click', () => this.close());
        });

        this.dialog.addEventListener('close', () => {
          this.dialog.classList.remove('active');
          this.body.innerHTML = '';
        });
      }

      setUrl(url) {
        this.youtubeUrl = url;
      }

      sanitizeUrl(url) {
        let urlToSanitize = url;
        if (urlToSanitize.includes('watch?v=')) {
          const videoId = urlToSanitize.split('v=')[1].split('&')[0];
          urlToSanitize = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0`;
        } else if (urlToSanitize.includes('youtube.com/embed/')) {
          const separator = urlToSanitize.includes('?') ? '&' : '?';
          if (!urlToSanitize.includes('autoplay=')) {
            urlToSanitize += `${separator}autoplay=1&mute=0`;
          }
        }
        return urlToSanitize;
      }

      show(url) {
        if (url) {
          this.youtubeUrl = url;
        }
        if (!this.youtubeUrl) return;

        const sanitized = this.sanitizeUrl(this.youtubeUrl);
        this.body.innerHTML = `
          <iframe width="100%" height="100%" src="${sanitized}" title="YouTube video player" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        `;

        this.dialog.showModal();
        setTimeout(() => {
          this.dialog.classList.add('active');
        }, 50);
      }

      close() {
        this.dialog.close();
      }
    };
  }


document.addEventListener(`DOMContentLoaded`,()=>{let e=document.querySelector(`[data-try-solutions-section]`);e&&e.querySelectorAll(`[data-solution-section]`).forEach(e=>{let t=e.querySelector(`[data-hover-trigger]`),n=e.querySelector(`[data-morphing-particles-component]`);!t||!n||(t.addEventListener(`mouseenter`,()=>{n.helper&&n.helper.onHover()}),t.addEventListener(`mouseleave`,()=>{n.helper&&n.helper.onLeave()}))})});