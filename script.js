/* =========================================================
   Nay Naing | Portfolio: vanilla JavaScript

   1. Scroll-driven 3D card flip
   2. Mobile navigation
   3. Active nav link (scroll spy)
   4. Scroll reveal (4b. Projects timeline, 4c. GitHub terminal)
   5. Contact form validation
   6. Footer year
   7. AI assistant (floating chat)
   ========================================================= */

(() => {
  'use strict';

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* ---------------------------------------------------------
     1. Scroll-driven 3D card flip

     progress = 0  -> scrollY at the top of the page (front of the card)
     progress = 1  -> About section has reached the upper part of the
                      viewport (back of the card / student ID)

     rotateY = ease(progress) * 180deg, updated on every animation frame
     while scrolling, so the flip tracks the scrollbar in real time.
     --------------------------------------------------------- */
  const card      = document.getElementById('card');
  const cardStage = document.querySelector('.card-stage');
  const aboutEl   = document.getElementById('about');
  const frontFace = document.getElementById('card-front');
  const backFace  = document.getElementById('card-back');

  if (card && aboutEl) {
    const FLIP_DEGREES   = 180;
    const FINISH_AT_VIEW = 0.3; // flip completes when About's top reaches 30% of the viewport height

    let flipEnd = 1;   // scrollY (px) at which the flip is complete
    let ticking = false;

    // Smoothstep: gentle start and finish, so the card eases in and out
    const ease = (t) => t * t * (3 - 2 * t);

    // Measure once (and on resize) instead of on every scroll event
    const measure = () => {
      const aboutTop = aboutEl.getBoundingClientRect().top + window.scrollY;
      flipEnd = Math.max(aboutTop - window.innerHeight * FINISH_AT_VIEW, 1);
    };

    const render = () => {
      ticking = false;

      const raw = clamp(window.scrollY / flipEnd, 0, 1);
      // Reduced motion: no scrubbing, just snap to the nearest side
      const progress = prefersReducedMotion.matches ? Math.round(raw) : ease(raw);
      const angle = progress * FLIP_DEGREES;

      card.style.transform = `rotateY(${angle.toFixed(2)}deg)`;
      if (cardStage) cardStage.style.setProperty('--p', progress.toFixed(3)); // drives the glow in CSS

      // Hide the face that is turned away from assistive tech
      const showingBack = angle > 90;
      frontFace.setAttribute('aria-hidden', String(showingBack));
      backFace.setAttribute('aria-hidden', String(!showingBack));
    };

    const requestRender = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(render);
      }
    };

    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', () => { measure(); requestRender(); });
    window.addEventListener('load', () => { measure(); requestRender(); }); // layout settles after fonts/images
    prefersReducedMotion.addEventListener('change', requestRender);

    measure();
    render();
  }


  /* ---------------------------------------------------------
     2. Mobile navigation
     --------------------------------------------------------- */
  const navToggle = document.querySelector('.nav__toggle');
  const navList   = document.getElementById('nav-menu');

  if (navToggle && navList) {
    const setMenu = (open) => {
      navToggle.setAttribute('aria-expanded', String(open));
      navList.classList.toggle('is-open', open);
    };

    navToggle.addEventListener('click', () => {
      setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close after choosing a link, on Escape, or when clicking elsewhere
    navList.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navList.classList.contains('is-open')) {
        setMenu(false);
        navToggle.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav')) setMenu(false);
    });
  }


  /* ---------------------------------------------------------
     3. Active nav link (scroll spy)
     --------------------------------------------------------- */
  const navLinks = [...document.querySelectorAll('.nav__link')];
  const spySections = ['home', 'about', 'skills', 'projects', 'github', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if ('IntersectionObserver' in window && spySections.length) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          const active = link.getAttribute('href') === `#${entry.target.id}`;
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' }); // a section is "current" while it crosses the viewport's middle

    spySections.forEach((section) => spy.observe(section));
  }


  /* ---------------------------------------------------------
     4. Scroll reveal
     --------------------------------------------------------- */
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('is-visible');
        observer.unobserve(el);

        // Once the entrance has played, drop the reveal styles so they don't
        // slow down the element's own hover transitions (e.g. project cards)
        window.setTimeout(() => {
          el.classList.remove('reveal', 'is-visible');
          el.style.transitionDelay = '';
        }, 1000);
      });
    }, { threshold: 0.15 });

    revealEls.forEach((el, i) => {
      // Small stagger for siblings that appear together (e.g. the project cards)
      el.style.transitionDelay = `${(i % 3) * 80}ms`;
      reveal.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }


  /* ---------------------------------------------------------
     4b. Projects cyber timeline
     - the centre line fills downwards as the section scrolls past
     - each card slides in from its own side (CSS) once it is in view
     --------------------------------------------------------- */
  const timeline      = document.getElementById('timeline');
  const timelineItems = document.querySelectorAll('.timeline__item');

  if (timeline) {
    let tlTicking = false;

    // 0 when the timeline's top reaches 60% of the viewport, 1 when its bottom does
    const updateTimeline = () => {
      tlTicking = false;
      const rect = timeline.getBoundingClientRect();
      const reachLine = window.innerHeight * 0.6;
      const progress = clamp((reachLine - rect.top) / rect.height, 0, 1);
      timeline.style.setProperty('--tl-p', progress.toFixed(4));
    };

    const requestTimeline = () => {
      if (!tlTicking) {
        tlTicking = true;
        window.requestAnimationFrame(updateTimeline);
      }
    };

    window.addEventListener('scroll', requestTimeline, { passive: true });
    window.addEventListener('resize', requestTimeline);
    updateTimeline();

    // Slide-in trigger (the CSS handles left/right direction and the glow)
    if ('IntersectionObserver' in window) {
      const cardObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });

      timelineItems.forEach((item) => cardObserver.observe(item));
    } else {
      timelineItems.forEach((item) => item.classList.add('is-in'));
    }
  }


  /* ---------------------------------------------------------
     4c. GitHub terminal
     - fills in live stats and recent repos from the public GitHub API
       (no token needed); on failure it prints "offline" instead
     - types the terminal out line by line when it scrolls into view
     --------------------------------------------------------- */
  const ghSection = document.getElementById('github');
  const term      = ghSection && ghSection.querySelector('.term');

  if (ghSection && term) {
    const user = ghSection.dataset.ghUser;
    const gh   = (key) => ghSection.querySelectorAll(`[data-gh="${key}"]`);
    const setText = (key, value) => gh(key).forEach((el) => { el.textContent = value; });

    setText('user', user);
    ghSection.querySelectorAll('a[href^="https://github.com/"]').forEach((a) => {
      a.href = `https://github.com/${user}`;
    });

    const repoList = gh('repos-list')[0];
    const printRepos = (items) => {
      repoList.replaceChildren(...items.map((item) => {
        const li = document.createElement('li');
        if (typeof item === 'string') {
          li.className = 'term__muted';
          li.textContent = item;
        } else {
          const a = document.createElement('a');
          a.href = item.html_url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = `${item.name}/`;
          li.append(a);
        }
        return li;
      }));
    };

    const api = (path) => fetch(`https://api.github.com/${path}`).then((res) => {
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      return res.json();
    });

    Promise.all([
      api(`users/${encodeURIComponent(user)}`),
      api(`users/${encodeURIComponent(user)}/repos?sort=updated&per_page=4`),
    ]).then(([profile, repos]) => {
      setText('repos', profile.public_repos);
      setText('followers', profile.followers);
      setText('following', profile.following);
      setText('since', new Date(profile.created_at).getFullYear());
      printRepos(repos.length ? repos : ['(no public repos yet)']);
    }).catch(() => {
      ['repos', 'followers', 'following', 'since'].forEach((key) => setText(key, 'offline'));
      printRepos(['connection refused: open the profile below instead']);
    });

    // Typing effect: reveal one line at a time, once
    const lines = [...term.querySelectorAll('.term__line')];
    if (!prefersReducedMotion.matches && 'IntersectionObserver' in window) {
      term.classList.add('is-typing');

      const typeObserver = new IntersectionObserver((entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        lines.forEach((line, i) => {
          window.setTimeout(() => line.classList.add('is-typed'), 250 + i * 320);
        });
      }, { threshold: 0.35 });

      typeObserver.observe(term);
    }
  }


  /* ---------------------------------------------------------
     5. Contact form validation
     Uses the browser's Constraint Validation API (the HTML
     attributes required / minlength / type=email) and replaces the
     default bubbles with inline messages and valid/invalid styling.
     --------------------------------------------------------- */
  const form       = document.getElementById('contact-form');
  const statusEl   = document.getElementById('form-status');
  const submitBtn  = form ? form.querySelector('[type="submit"]') : null;
  const messageBox = document.getElementById('message');
  const counterEl  = document.getElementById('message-count');

  if (form) {
    const fields = [...form.querySelectorAll('.field__control')];

    // Friendly messages for each failing constraint
    const messageFor = (input) => {
      const { validity } = input;
      const label = input.labels[0].textContent.trim().toLowerCase();

      if (validity.valueMissing)  return `Please enter your ${label}.`;
      if (validity.typeMismatch)  return 'Please enter a valid email address, like name@example.com.';
      if (validity.tooShort)      return `Your ${label} should be at least ${input.minLength} characters (currently ${input.value.length}).`;
      return 'Please check this field.';
    };

    // Stricter than type="email": also require a dot in the domain (name@site.com)
    const extraCheck = (input) => {
      if (input.type === 'email' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value)) {
        input.setCustomValidity('Invalid email');
      } else {
        input.setCustomValidity('');
      }
    };

    const validate = (input) => {
      extraCheck(input);
      const wrapper = input.closest('.field');
      const errorEl = document.getElementById(`${input.id}-error`);
      const valid   = input.checkValidity();

      wrapper.classList.toggle('is-valid', valid);
      wrapper.classList.toggle('is-invalid', !valid);
      input.setAttribute('aria-invalid', String(!valid));
      errorEl.textContent = valid ? '' : messageFor(input);
      return valid;
    };

    // Validate a field once the visitor has left it; after that, validate live while typing
    fields.forEach((input) => {
      input.addEventListener('blur', () => { input.dataset.touched = 'true'; validate(input); });
      input.addEventListener('input', () => { if (input.dataset.touched) validate(input); });
    });

    // Live character counter
    const updateCount = () => {
      counterEl.textContent = `${messageBox.value.length} / ${messageBox.maxLength}`;
    };
    messageBox.addEventListener('input', updateCount);

    const setStatus = (text, type) => {
      statusEl.textContent = text;
      statusEl.className = `contact__status${type ? ` is-${type}` : ''}`;
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      setStatus('', '');

      // Validate every field (no short-circuit, so all errors show at once)
      const results = fields.map((input) => { input.dataset.touched = 'true'; return validate(input); });
      if (results.includes(false)) {
        fields.find((input) => !input.checkValidity()).focus();
        setStatus('Please fix the highlighted fields and try again.', 'error');
        return;
      }

      /*
        This portfolio has no back end, so the send is simulated.
        To make it real, replace the timeout with a request, e.g.:
          fetch('https://formspree.io/f/your-id', { method: 'POST', body: new FormData(form) })
      */
      submitBtn.disabled = true;
      submitBtn.classList.add('is-loading');
      setStatus('Sending…', '');

      window.setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        setStatus('Thanks! Your message has been sent. I will get back to you soon.', 'success');

        form.reset();
        fields.forEach((input) => {
          delete input.dataset.touched;
          input.removeAttribute('aria-invalid');
          input.closest('.field').classList.remove('is-valid', 'is-invalid');
          document.getElementById(`${input.id}-error`).textContent = '';
        });
        updateCount();
      }, 1200);
    });
  }


  /* ---------------------------------------------------------
     6. Footer year
     --------------------------------------------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) {
    const year = new Date().getFullYear();
    yearEl.textContent = year;
    yearEl.setAttribute('datetime', String(year));
  }


  /* ---------------------------------------------------------
     7. AI assistant (floating chat)
     - keeps the conversation in memory and posts it to /api/chat
       (Vercel serverless function that calls Gemini with the key
       kept on the server)
     - replies are rendered as text nodes, never as HTML, so a model
       answer can't inject markup; only **bold**, `code` and line
       breaks are formatted
     --------------------------------------------------------- */
  const chat       = document.getElementById('chat');
  const chatToggle = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const chatClose  = document.getElementById('chat-close');
  const chatForm   = document.getElementById('chat-form');
  const chatInput  = document.getElementById('chat-input');
  const chatList   = document.getElementById('chat-messages');
  const chatSuggest = document.getElementById('chat-suggest');

  if (chat && chatToggle && chatWindow && chatForm && chatInput && chatList) {
    const CHAT_ENDPOINT = '/api/chat';
    const HISTORY_LIMIT = 12;
    const history = []; // [{ role: 'user' | 'model', text }]
    const sendBtn = chatForm.querySelector('.chat__send');
    let busy = false;

    const setChatOpen = (open) => {
      chat.classList.toggle('is-open', open);
      chatWindow.hidden = !open;
      chatToggle.setAttribute('aria-expanded', String(open));
      chatToggle.querySelector('.visually-hidden').textContent =
        open ? "Close Nay Naing's AI assistant" : "Open Nay Naing's AI assistant";
      if (open) chatInput.focus();
    };

    chatToggle.addEventListener('click', () => setChatOpen(chatWindow.hidden));
    chatClose.addEventListener('click', () => { setChatOpen(false); chatToggle.focus(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !chatWindow.hidden) { setChatOpen(false); chatToggle.focus(); }
    });

    const scrollToBottom = () => { chatList.scrollTop = chatList.scrollHeight; };

    // Append text to `parent`, turning **bold** and `code` into elements
    const appendFormatted = (parent, text) => {
      text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((part) => {
        if (!part) return;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          parent.append(strong);
        } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          const code = document.createElement('code');
          code.textContent = part.slice(1, -1);
          parent.append(code);
        } else {
          parent.append(document.createTextNode(part.replace(/^\* /gm, '• ').replace(/^- /gm, '• ')));
        }
      });
    };

    const addMessage = (role, text, { error = false } = {}) => {
      const li = document.createElement('li');
      li.className = `chat__msg chat__msg--${role === 'user' ? 'user' : 'bot'}${error ? ' chat__msg--error' : ''}`;
      if (role === 'user') li.textContent = text;
      else appendFormatted(li, text);
      chatList.append(li);
      scrollToBottom();
      return li;
    };

    const showTyping = () => {
      const li = document.createElement('li');
      li.className = 'chat__msg chat__msg--bot chat__typing';
      li.setAttribute('aria-label', 'Assistant is typing');
      li.innerHTML = '<i></i><i></i><i></i>';
      chatList.append(li);
      scrollToBottom();
      return li;
    };

    const setBusy = (state) => {
      busy = state;
      sendBtn.disabled = state;
      chatList.setAttribute('aria-busy', String(state));
    };

    const sendMessage = async (text) => {
      const message = text.trim();
      if (!message || busy) return;

      if (chatSuggest) chatSuggest.hidden = true;
      addMessage('user', message);
      history.push({ role: 'user', text: message });
      chatInput.value = '';
      setBusy(true);
      const typing = showTyping();

      try {
        const res = await fetch(CHAT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-HISTORY_LIMIT) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.reply) throw new Error(data.error || 'The assistant is unavailable right now.');

        typing.remove();
        addMessage('model', data.reply);
        history.push({ role: 'model', text: data.reply });
      } catch (err) {
        typing.remove();
        // The failed question stays out of the history so it can simply be asked again
        history.pop();
        const offline = location.protocol === 'file:' || err instanceof TypeError;
        addMessage('model', offline
          ? 'I can\'t reach my server from here. The assistant works once the site is deployed (or running with "vercel dev").'
          : err.message, { error: true });
      } finally {
        setBusy(false);
        chatInput.focus();
      }
    };

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(chatInput.value);
    });

    if (chatSuggest) {
      chatSuggest.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) sendMessage(btn.textContent);
      });
    }
  }
})();
