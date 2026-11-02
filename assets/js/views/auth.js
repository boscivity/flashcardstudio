// Log in, sign up, forgot password and set-new-password screens.
import { html, render, icon, toast } from '../ui.js?v=2.0.1';
import * as auth from '../auth.js?v=2.0.1';
import * as store from '../store.js?v=2.0.1';

const SCREENS = {
  login: {
    title: 'Welcome back',
    lead: 'Log in to sync your decks and progress.',
    submit: 'Log in',
    fields: ['email', 'password'],
    foot: html`<a href="#/forgot">Forgot password?</a><span>New here? <a href="#/signup">Create an account</a></span>`
  },
  signup: {
    title: 'Create your account',
    lead: 'Free forever. Your decks sync across all your devices.',
    submit: 'Create account',
    fields: ['email', 'newPassword'],
    foot: html`<span>Already have an account? <a href="#/login">Log in</a></span>`
  },
  forgot: {
    title: 'Reset your password',
    lead: 'We’ll email you a link to choose a new password.',
    submit: 'Send reset link',
    fields: ['email'],
    foot: html`<a href="#/login">${icon('back')} Back to log in</a>`
  },
  reset: {
    title: 'Choose a new password',
    lead: 'Pick something at least 8 characters long.',
    submit: 'Save new password',
    fields: ['newPassword', 'confirm'],
    foot: html``
  }
};

const FIELD_HTML = {
  email: html`<label class="field"><span class="field__label">Email</span><input type="email" name="email" autocomplete="email" inputmode="email" required placeholder="you@example.com"></label>`,
  password: html`<label class="field"><span class="field__label">Password</span><input type="password" name="password" autocomplete="current-password" required></label>`,
  newPassword: html`<label class="field"><span class="field__label">Password</span><input type="password" name="newPassword" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>`,
  confirm: html`<label class="field"><span class="field__label">Confirm password</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>`
};

export function authView(kind) {
  return ({ root }) => {
    const screen = SCREENS[kind];
    const guestCount = store.state.user ? 0 : store.state.decks.length;
    render(root, html`
      <div class="page auth">
        <form class="auth__card panel" novalidate data-auth>
          <a class="auth__brand" href="#/"><img src="assets/img/icon-192.png" alt="" width="40" height="40"><span>Flashcard Studio</span></a>
          <h1>${screen.title}</h1>
          <p class="muted">${screen.lead}</p>
          ${kind === 'signup' && guestCount ? html`<p class="note">${icon('cloud')} Your ${guestCount === 1 ? 'deck' : `${guestCount} decks`} on this device can be moved into your new account.</p>` : ''}
          ${kind === 'reset' && !store.state.user ? html`<p class="form-status" data-tone="error">This reset link has expired or was already used. <a href="#/forgot">Send a new one</a>.</p>` : ''}
          ${screen.fields.map(f => FIELD_HTML[f])}
          <p class="form-status" data-status role="status" hidden></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">${screen.submit}</button>
          <div class="auth__foot">${screen.foot}</div>
        </form>
      </div>`);
    const form = root.querySelector('form');
    const status = root.querySelector('[data-status]');
    const say = (message, tone = 'info', extra = '') => {
      status.hidden = false;
      status.dataset.tone = tone;
      render(status, html`${message}${extra}`);
    };
    form.querySelector('input')?.focus();

    const onSubmit = async event => {
      event.preventDefault();
      const email = form.email?.value.trim().toLowerCase();
      const button = form.querySelector('[type="submit"]');
      if (form.email && !auth.isValidEmail(email)) return say('Enter a valid email address.', 'error');
      if (form.password && !form.password.value) return say('Enter your password.', 'error');
      if (form.newPassword && form.newPassword.value.length < 8) return say('Use at least 8 characters for your password.', 'error');
      if (form.confirm && form.confirm.value !== form.newPassword.value) return say('The passwords don’t match.', 'error');
      button.disabled = true;
      try {
        if (kind === 'login') {
          say('Logging in…');
          await auth.signIn(email, form.password.value);
          // main.js handles the SIGNED_IN event and navigation.
        } else if (kind === 'signup') {
          say('Creating your account…');
          const result = await auth.signUp(email, form.newPassword.value);
          if (result.needsConfirmation) {
            form.reset();
            say('Almost there! We sent a confirmation link to ', 'success', html`<strong>${email}</strong>. Open it on this device to finish signing up.`);
          }
        } else if (kind === 'forgot') {
          say('Sending…');
          await auth.sendPasswordReset(email);
          say('If an account exists for ', 'success', html`<strong>${email}</strong>, a reset link is on its way. Check your inbox and spam folder.`);
        } else if (kind === 'reset') {
          say('Saving…');
          await auth.updatePassword(form.newPassword.value);
          toast('Password updated — you’re logged in.');
          location.hash = '#/';
        }
      } catch (err) {
        const message = err.message || 'Something went wrong. Please try again.';
        if (kind === 'login' && /confirm your email/i.test(message)) {
          say(message, 'error', html` <button type="button" class="link-btn" data-resend>Resend link</button>`);
        } else say(message, 'error');
      } finally {
        button.disabled = false;
      }
    };

    const onClick = async event => {
      if (!event.target.closest('[data-resend]')) return;
      try {
        await auth.resendConfirmation(form.email.value.trim().toLowerCase());
        say('Confirmation email sent. Check your inbox.', 'success');
      } catch (err) { say(err.message, 'error'); }
    };

    form.addEventListener('submit', onSubmit);
    form.addEventListener('click', onClick);
    return () => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('click', onClick);
    };
  };
}
