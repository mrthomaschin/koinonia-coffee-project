import React, { FormEvent, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { SavedAddress } from '../../models/AccountModel';

const EMPTY_ADDRESS: SavedAddress = { line1: '', line2: '', city: '', state: '', postal_code: '', country: 'US' };

const formatAddress = (address: SavedAddress): string =>
  [address.line1, address.line2, `${address.city}, ${address.state} ${address.postal_code}`, address.country].filter(Boolean).join('\n');

const sameAddress = (first: SavedAddress, second: SavedAddress): boolean =>
  (Object.keys(EMPTY_ADDRESS) as Array<keyof SavedAddress>).every((key) => first[key].trim().toLowerCase() === second[key].trim().toLowerCase());

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Please try again.';

const AddressFields: React.FC<{ section: 'shipping' | 'billing'; value: SavedAddress; onChange: (value: SavedAddress) => void }> = ({ section, value, onChange }) => {
  const field = (key: keyof SavedAddress) => ({
    value: value[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: key === 'country' ? event.target.value.toUpperCase() : event.target.value }),
  });
  return <>
    <label>Address<input {...field('line1')} autoComplete={`section-${section} ${section} address-line1`} required /></label>
    <label>Apartment, suite, etc. (optional)<input {...field('line2')} autoComplete={`section-${section} ${section} address-line2`} /></label>
    <div className="account-address-row">
      <label>City<input {...field('city')} autoComplete={`section-${section} ${section} address-level2`} required /></label>
      <label>State<input {...field('state')} autoComplete={`section-${section} ${section} address-level1`} required /></label>
      <label>ZIP code<input {...field('postal_code')} autoComplete={`section-${section} ${section} postal-code`} required /></label>
    </div>
    <label>Country<input {...field('country')} autoComplete={`section-${section} ${section} country`} minLength={2} maxLength={2} pattern="[A-Za-z]{2}" title="Two-letter country code, such as US" required /></label>
  </>;
};

const ContactCard: React.FC = () => {
  const { account, updateProfile, resendVerification } = useAccount();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  if (!account) return null;

  const isPartner = account.label === 'wholesale' || account.label === 'church-ministry';
  const emailChanged = email.trim().toLowerCase() !== account.user.email.toLowerCase();

  const startEditing = (): void => {
    setFirstName(account.user.firstName);
    setLastName(account.user.lastName);
    setEmail(account.user.email);
    setCurrentPassword('');
    setError('');
    setNotice('');
    setEditing(true);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { verificationSent } = await updateProfile({ firstName, lastName, email, ...(emailChanged ? { currentPassword } : {}) });
      setEditing(false);
      if (!emailChanged) setNotice('Your details were updated.');
      else if (verificationSent) setNotice(`We sent a confirmation link to ${email.trim().toLowerCase()}. Your email changes once you open it.`);
      else setNotice('Your change is saved, but we couldn’t send the confirmation email. Use “Resend link” to try again.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const run = async (request: () => Promise<string>): Promise<void> => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      setNotice(await request());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const resend = (): Promise<void> => run(async () => `We sent a new link to ${await resendVerification()}.`);
  // Submitting the current email cancels the pending change.
  const cancelEmailChange = (): Promise<void> => run(async () => {
    await updateProfile({ firstName: account.user.firstName, lastName: account.user.lastName, email: account.user.email });
    return 'The email change was canceled.';
  });

  if (!editing) {
    return <article className="account-detail-card">
      <h3>Contact information</h3>
      <p>{account.user.firstName} {account.user.lastName}<br />{account.user.email}</p>
      {account.pendingEmail && <div className="account-pending">
        <p>Waiting for you to confirm <strong>{account.pendingEmail}</strong>. Open the link we emailed to finish the change.</p>
        <span className="account-form-actions">
          <button className="account-link" onClick={() => void resend()} disabled={saving}>Resend link</button>
          <button className="account-cancel" onClick={() => void cancelEmailChange()} disabled={saving}>Cancel change</button>
        </span>
      </div>}
      {notice && <p className="account-success" role="status">{notice}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="account-link" onClick={startEditing}>Manage details</button>
    </article>;
  }

  return <article className="account-detail-card account-detail-card-editing">
    <h3>Contact information</h3>
    <form onSubmit={submit} className="account-form">
      <div className="account-name-row">
        <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required /></label>
        <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required /></label>
      </div>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" disabled={isPartner} required /></label>
      {isPartner && <p className="account-hint">Please contact us to change the email on a partner account.</p>}
      {emailChanged && <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>}
      {emailChanged && <p className="account-hint">For your security, enter your password. We’ll email a link to the new address, and your email changes once you open it. Orders placed under your previous email stay in your order history.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        <button type="submit" className="account-submit" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        <button type="button" className="account-link" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      </div>
    </form>
  </article>;
};

const AddressesCard: React.FC = () => {
  const { savedAddresses, updateAddresses } = useAccount();
  const [editing, setEditing] = useState(false);
  const [shipping, setShipping] = useState<SavedAddress>(EMPTY_ADDRESS);
  const [billing, setBilling] = useState<SavedAddress>(EMPTY_ADDRESS);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = { shipping: savedAddresses?.shipping || null, billing: savedAddresses?.billing || null };

  const startEditing = (): void => {
    const savedShipping = saved.shipping || EMPTY_ADDRESS;
    setShipping(savedShipping);
    setBilling(saved.billing || EMPTY_ADDRESS);
    setBillingSameAsShipping(!saved.billing || sameAddress(saved.billing, savedShipping));
    setError('');
    setNotice('');
    setEditing(true);
  };

  const save = async (request: () => Promise<void>, successNotice: string): Promise<void> => {
    setError('');
    setSaving(true);
    try {
      await request();
      setEditing(false);
      setNotice(successNotice);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void save(() => updateAddresses({ shippingAddress: shipping, billingAddress: billingSameAsShipping ? shipping : billing }), 'Your addresses were saved.');
  };

  const remove = (field: 'shippingAddress' | 'billingAddress'): void => {
    void save(() => updateAddresses({ [field]: null }), 'The address was removed.');
  };

  if (!editing) {
    const hasAddress = !!saved.shipping || !!saved.billing;
    return <article className="account-detail-card">
      <h3>Saved addresses</h3>
      {!hasAddress && <p>No saved addresses yet. Add one for a faster checkout next time.</p>}
      {hasAddress && <div className="account-address-list">
        {saved.shipping && <div><h4>Shipping</h4><p>{formatAddress(saved.shipping)}</p><button className="account-cancel" onClick={() => remove('shippingAddress')} disabled={saving}>Remove</button></div>}
        {saved.billing && <div><h4>Billing</h4><p>{formatAddress(saved.billing)}</p><button className="account-cancel" onClick={() => remove('billingAddress')} disabled={saving}>Remove</button></div>}
      </div>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {notice && <p className="account-success" role="status">{notice}</p>}
      <button className="account-link" onClick={startEditing}>{hasAddress ? 'Edit addresses' : 'Add an address'}</button>
    </article>;
  }

  return <article className="account-detail-card account-detail-card-editing">
    <h3>Saved addresses</h3>
    <form onSubmit={submit} className="account-form">
      <h4>Shipping address</h4>
      <p className="account-hint">Used at checkout and for your subscription deliveries.</p>
      <AddressFields section="shipping" value={shipping} onChange={setShipping} />
      <label className="account-checkbox"><input type="checkbox" checked={billingSameAsShipping} onChange={(event) => setBillingSameAsShipping(event.target.checked)} />Billing address is the same as shipping</label>
      {!billingSameAsShipping && <><h4>Billing address</h4><AddressFields section="billing" value={billing} onChange={setBilling} /></>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        <button type="submit" className="account-submit" disabled={saving}>{saving ? 'Saving…' : 'Save addresses'}</button>
        <button type="button" className="account-link" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      </div>
    </form>
  </article>;
};

const PasswordCard: React.FC = () => {
  const { changePassword } = useAccount();
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = (): void => {
    setCurrentPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setError('');
    setNotice('');
    setEditing(true);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    if (newPassword !== repeatPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const signedOut = await changePassword({ currentPassword, newPassword });
      setEditing(false);
      setNotice(signedOut > 0
        ? `Your password was changed, and ${signedOut === 1 ? 'your other device was' : `${signedOut} other devices were`} signed out.`
        : 'Your password was changed.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return <article className="account-detail-card">
      <h3>Password</h3>
      <p>Changing your password signs you out on your other devices.</p>
      {notice && <p className="account-success" role="status">{notice}</p>}
      <button className="account-link" onClick={startEditing}>Change password</button>
    </article>;
  }

  return <article className="account-detail-card account-detail-card-editing">
    <h3>Password</h3>
    <form onSubmit={submit} className="account-form">
      <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
      <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <label>Repeat new password<input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">
        <button type="submit" className="account-submit" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
        <button type="button" className="account-link" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      </div>
    </form>
  </article>;
};

const AccountDetailsPage: React.FC = () => {
  const { account } = useAccount();
  if (!account) return null;
  return <><p className="account-section-kicker">Your information</p><h2>Account details</h2><div className="account-detail-grid"><ContactCard /><AddressesCard /><PasswordCard /></div></>;
};

export default AccountDetailsPage;
