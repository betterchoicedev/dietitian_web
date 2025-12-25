import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Users as UsersIcon, Building2, RefreshCw, Loader2, UserCheck, UserPlus, Ban, Copy, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Profiles, Companies, ChatUser, RegistrationInvites } from '@/api/entities';
import { getMyProfile } from '@/utils/auth';
import { cn } from '@/lib/utils';

const COMPANY_NONE = 'none';
const PROVIDER_NONE = 'none';

export default function UserManagement() {
  const { translations, isRTL } = useLanguage();
  const { toast } = useToast();

  const [me, setMe] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState({});
  const [updatingClient, setUpdatingClient] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'employee',
    companyId: COMPANY_NONE,
    expiresInHours: '',
    notes: '',
  });
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [visibleClientCount, setVisibleClientCount] = useState(10);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);

  const roleLabels = useMemo(() => ({
    sys_admin: translations?.roleLabelSysAdmin || 'System Admin',
    company_manager: translations?.roleLabelCompanyManager || 'Company Manager',
    employee: translations?.roleLabelEmployee || 'Employee',
  }), [translations]);

  const baseRoleOptions = useMemo(() => ([
    { value: 'sys_admin', label: roleLabels.sys_admin },
    { value: 'company_manager', label: roleLabels.company_manager },
    { value: 'employee', label: roleLabels.employee },
  ]), [roleLabels]);

  const allowed = useMemo(() => {
    if (!me) return false;
    return me.role === 'sys_admin' || me.role === 'company_manager';
  }, [me]);
  const isCompanyManager = me?.role === 'company_manager';

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const profile = await getMyProfile();
        setMe(profile);

        if (profile.role !== 'sys_admin' && profile.role !== 'company_manager') {
          setLoading(false);
          return;
        }

        await loadData(profile);
      } catch (err) {
        console.error('❌ Failed to initialize user management page:', err);
        setError(err.message || 'Failed to load management data');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const loadInvites = async (profile = me) => {
    if (!profile || profile.role !== 'sys_admin') {
      setInvites([]);
      return;
    }
    try {
      setInvitesLoading(true);
      setInvitesError(null);
      const data = await RegistrationInvites.list();
      setInvites(data);
    } catch (err) {
      console.error('❌ Failed to load registration invites:', err);
      setInvitesError(err.message || 'Failed to load invitations');
    } finally {
      setInvitesLoading(false);
    }
  };

  const loadData = async (currentProfile = me) => {
    try {
      setRefreshing(true);
      const [profileRows, companyRows, clientRows] = await Promise.all([
        Profiles.list(),
        Companies.list(),
        ChatUser.list(),
      ]);

      if (!currentProfile) {
        currentProfile = await getMyProfile();
        setMe(currentProfile);
      }

      const visibleProfiles =
        currentProfile.role === 'sys_admin'
          ? profileRows
          : profileRows.filter((p) => {
              // Company managers: only show profiles from their company and exclude sys_admins
              if (currentProfile.role === 'company_manager') {
                return p.company_id === currentProfile.company_id && p.role !== 'sys_admin';
              }
              // Employees: only show profiles from their company
              return p.company_id === currentProfile.company_id;
            });

      const companyMembers = new Set(visibleProfiles.map((p) => p.id));

      const visibleClients =
        currentProfile.role === 'sys_admin'
          ? clientRows
          : clientRows.filter(
              (c) => c.provider_id && companyMembers.has(c.provider_id),
            );

      setProfiles(visibleProfiles);
      setCompanies(
        currentProfile.role === 'sys_admin'
          ? companyRows
          : companyRows.filter((c) => c.id === currentProfile.company_id),
      );
      setClients(visibleClients);

      await loadInvites(currentProfile);
    } catch (err) {
      console.error('❌ Failed to load management data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setRefreshing(false);
    }
  };

  const shouldShowInvites = me?.role === 'sys_admin';

  const getInviteStatus = (invite) => {
    const now = Date.now();
    if (invite.revoked_at) {
      return {
        label: translations?.inviteStatusRevoked || 'Revoked',
        variant: 'destructive',
      };
    }
    if (invite.used_at) {
      return {
        label: translations?.inviteStatusUsed || 'Used',
        variant: 'secondary',
      };
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() < now) {
      return {
        label: translations?.inviteStatusExpired || 'Expired',
        variant: 'secondary',
      };
    }
    return {
      label: translations?.inviteStatusActive || 'Active',
      variant: 'outline',
    };
  };

  const formatDateTime = (value) => {
    if (!value) return translations?.notAvailable || '—';
    try {
      return new Date(value).toLocaleString();
    } catch (err) {
      console.warn('Failed to parse date', value, err);
      return value;
    }
  };

  const isSubscriptionActive = (client) => {
    if (!client.subscription_status) return false;
    if (client.subscription_status.toLowerCase() !== 'active') return false;
    if (client.subscription_expires_at) {
      const expiresAt = new Date(client.subscription_expires_at).getTime();
      const now = Date.now();
      return expiresAt > now;
    }
    return true;
  };

  const isActiveButExpired = (client) => {
    // Status is "active" but expiration date has passed
    if (!client.subscription_status) return false;
    if (client.subscription_status.toLowerCase() !== 'active') return false;
    if (client.subscription_expires_at) {
      const expiresAt = new Date(client.subscription_expires_at).getTime();
      const now = Date.now();
      return expiresAt <= now; // Expired
    }
    return false;
  };

  const getSubscriptionInfo = (client) => {
    const isActive = isSubscriptionActive(client);
    const isActiveExpired = isActiveButExpired(client);
    const status = client.subscription_status || 'none';
    const type = client.subscription_type || null;
    const expiresAt = client.subscription_expires_at || null;

    return {
      isActive,
      isActiveExpired,
      status,
      type,
      expiresAt,
    };
  };

  const formatSubscriptionType = (type) => {
    if (!type) return translations?.noSubscription || 'No subscription';
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  const formatSubscriptionExpiry = (expiresAt) => {
    if (!expiresAt) return translations?.noExpiration || 'No expiration';
    try {
      const expiryDate = new Date(expiresAt);
      const now = Date.now();
      const diffMs = expiryDate.getTime() - now;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return translations?.expired || 'Expired';
      } else if (diffDays === 0) {
        return translations?.expiresToday || 'Expires today';
      } else if (diffDays === 1) {
        return translations?.expiresTomorrow || 'Expires tomorrow';
      } else if (diffDays <= 7) {
        return `${diffDays} ${translations?.days || 'days'}`;
      } else {
        return expiryDate.toLocaleDateString();
      }
    } catch (err) {
      console.warn('Failed to parse expiry date', expiresAt, err);
      return expiresAt;
    }
  };

  const isInviteActive = (invite) => {
    if (invite.revoked_at || invite.used_at) return false;
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return false;
    return true;
  };

  const activeInvitesCount = useMemo(
    () => invites.filter(isInviteActive).length,
    [invites],
  );

  const visibleInvites = useMemo(
    () => (showInviteHistory ? invites : invites.filter(isInviteActive)),
    [invites, showInviteHistory],
  );

  const handleInviteFieldChange = (field, value) => {
    setInviteForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetInviteForm = () => {
    setInviteForm({
      email: '',
      role: 'employee',
      companyId: COMPANY_NONE,
      expiresInHours: '',
      notes: '',
    });
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) {
      toast({
        title: translations?.error || 'Error',
        description: translations?.inviteEmailRequired || 'Email is required to create an invitation.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setCreatingInvite(true);
      const payload = {
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        company_id: inviteForm.companyId === COMPANY_NONE ? null : inviteForm.companyId,
        expires_in_hours: inviteForm.expiresInHours ? Number(inviteForm.expiresInHours) : null,
        notes: inviteForm.notes?.trim() || null,
      };
      const invite = await RegistrationInvites.create(payload);
      toast({
        title: translations?.inviteCreated || 'Invitation created',
        description: `${translations?.inviteCodeLabel || 'Code'}: ${invite.code}`,
      });
      resetInviteForm();
      await loadInvites(me);
    } catch (err) {
      console.error('❌ Failed to create invite:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || 'Failed to create invitation.',
        variant: 'destructive',
      });
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (code) => {
    try {
      await RegistrationInvites.revoke(code);
      toast({
        title: translations?.inviteRevoked || 'Invitation revoked',
        description: translations?.inviteRevokedDescription || 'The code can no longer be used.',
      });
      await loadInvites(me);
    } catch (err) {
      console.error('❌ Failed to revoke invite:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || 'Failed to revoke invitation.',
        variant: 'destructive',
      });
    }
  };

  const handleCopyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: translations?.copied || 'Copied',
        description: translations?.inviteLinkCopied || 'Invitation code copied to clipboard.',
      });
    } catch (err) {
      console.error('❌ Failed to copy invite code:', err);
      toast({
        title: translations?.error || 'Error',
        description: translations?.copyFailed || 'Unable to copy the invitation code.',
        variant: 'destructive',
      });
    }
  };

  const generateClientReferralLink = () => {
    if (!me?.id) return '';
    // Encode the dietitian ID in base64 and use hash fragment to hide it from URL when copying
    // The signup page needs to read window.location.hash to get the ID
    const encodedId = btoa(me.id);
    return `https://betterchoice.one/signup#d=${encodedId}`;
  };

  const handleCopyReferralLink = async () => {
    const link = generateClientReferralLink();
    if (!link) {
      toast({
        title: translations?.error || 'Error',
        description: translations?.unableToGenerateLink || 'Unable to generate referral link.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: translations?.copied || 'Copied',
        description: translations?.referralLinkCopied || 'Client referral link copied to clipboard.',
      });
    } catch (err) {
      console.error('❌ Failed to copy referral link:', err);
      toast({
        title: translations?.error || 'Error',
        description: translations?.copyFailed || 'Unable to copy the referral link.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    const trimmedName = newCompanyName.trim();
    if (!trimmedName) {
      toast({
        title: translations?.error || 'Error',
        description:
          translations?.companyNameRequired || 'Company name is required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setCreatingCompany(true);
      const company = await Companies.create(trimmedName);
      toast({
        title: translations?.companyCreated || 'Company created',
        description: company?.name || trimmedName,
      });
      setNewCompanyName('');
      await loadData();
    } catch (err) {
      console.error('❌ Failed to create company:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || 'Failed to create company.',
        variant: 'destructive',
      });
    } finally {
      setCreatingCompany(false);
    }
  };

  const companyMap = useMemo(() => {
    const map = new Map();
    companies.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [companies]);

  const profileMap = useMemo(() => {
    const map = new Map();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const filteredClients = useMemo(() => {
    let result = clients;
    
    // Filter by search term if provided
    if (clientSearchTerm.trim()) {
      const term = clientSearchTerm.trim().toLowerCase();
      result = result.filter((client) => {
        const nameMatch = client.full_name?.toLowerCase().includes(term);
        const codeMatch = client.user_code?.toLowerCase().includes(term);
        const emailMatch = client.email?.toLowerCase().includes(term);
        const phoneMatch = client.phone_number?.toLowerCase().includes(term);
        return nameMatch || codeMatch || emailMatch || phoneMatch;
      });
    }
    
    // Sort: active subscriptions first, then active but expired (yellow), then clients with names, then alphabetically
    return result.sort((a, b) => {
      const aActive = isSubscriptionActive(a);
      const bActive = isSubscriptionActive(b);
      const aActiveExpired = isActiveButExpired(a);
      const bActiveExpired = isActiveButExpired(b);
      
      // Priority: 1 = truly active, 2 = active but expired, 3 = everything else
      const aPriority = aActive ? 1 : aActiveExpired ? 2 : 3;
      const bPriority = bActive ? 1 : bActiveExpired ? 2 : 3;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If both have same priority, prioritize clients with names
      const aHasName = Boolean(a.full_name?.trim());
      const bHasName = Boolean(b.full_name?.trim());
      
      if (aHasName && !bHasName) return -1;
      if (!aHasName && bHasName) return 1;
      
      // If both have same name status, sort alphabetically by name
      const aName = a.full_name || '';
      const bName = b.full_name || '';
      return aName.localeCompare(bName);
    });
  }, [clients, clientSearchTerm]);

  const displayedClients = useMemo(
    () => filteredClients.slice(0, visibleClientCount),
    [filteredClients, visibleClientCount],
  );

  const canShowMoreClients = filteredClients.length > displayedClients.length;

  const resetClientPagination = () => {
    setVisibleClientCount(10);
  };

  const handleProfileUpdate = async (profileId, patch, successMessage) => {
    try {
      setUpdatingProfile((prev) => ({ ...prev, [profileId]: true }));
      const updated = await Profiles.update(profileId, patch);
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, ...updated } : p)),
      );
      toast({
        title: successMessage,
        description: translations?.changesSaved || 'Changes saved successfully.',
      });
    } catch (err) {
      console.error('❌ Failed to update profile:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || 'Failed to update profile.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingProfile((prev) => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
    }
  };

  const handleRoleChange = (profileId, nextRole) => {
    if (!me) return;
    const targetProfile = profiles.find((p) => p.id === profileId);
    if (isCompanyManager && targetProfile?.role === 'sys_admin') {
      toast({
        title: translations?.notAllowed || 'Not allowed',
        description:
          translations?.cannotModifySysAdmin ||
          'Company managers cannot change system admin roles.',
        variant: 'destructive',
      });
      return;
    }
    if (me.role === 'company_manager' && nextRole === 'sys_admin') {
      toast({
        title: translations?.notAllowed || 'Not allowed',
        description:
          translations?.cannotPromoteToSysAdmin ||
          'Company managers cannot promote users to system admin.',
        variant: 'destructive',
      });
      return;
    }

    handleProfileUpdate(
      profileId,
      { role: nextRole },
      translations?.roleUpdated || 'Role updated',
    );
  };

  const handleCompanyChange = (profileId, nextCompanyId) => {
    if (!me) return;
    const targetProfile = profiles.find((p) => p.id === profileId);
    if (isCompanyManager && targetProfile?.role === 'sys_admin') {
      toast({
        title: translations?.notAllowed || 'Not allowed',
        description:
          translations?.cannotModifySysAdmin ||
          'Company managers cannot change system admin assignments.',
        variant: 'destructive',
      });
      return;
    }
    if (me.role === 'company_manager' && nextCompanyId !== me.company_id) {
      toast({
        title: translations?.notAllowed || 'Not allowed',
        description:
          translations?.cannotChangeCompany ||
          'Company managers can only assign users to their own company.',
        variant: 'destructive',
      });
      return;
    }

    handleProfileUpdate(
      profileId,
      { company_id: nextCompanyId === COMPANY_NONE ? null : nextCompanyId },
      translations?.companyUpdated || 'Company updated',
    );
  };

  const handleAssignProvider = async (userCode, providerId) => {
    try {
      if (isCompanyManager) {
        const targetProfile =
          providerId && providerId !== PROVIDER_NONE
            ? profiles.find((p) => p.id === providerId)
            : null;
        if (targetProfile?.role === 'sys_admin') {
          toast({
            title: translations?.notAllowed || 'Not allowed',
            description:
              translations?.cannotAssignSysAdmin ||
              'Company managers cannot assign clients to system admins.',
            variant: 'destructive',
          });
          return;
        }
      }

      setUpdatingClient((prev) => ({ ...prev, [userCode]: true }));
      const result = await ChatUser.update(userCode, {
        provider_id: providerId === PROVIDER_NONE ? null : providerId,
      });
      setClients((prev) =>
        prev.map((client) =>
          client.user_code === userCode ? { ...client, ...result } : client,
        ),
      );
      toast({
        title: translations?.assignmentUpdated || 'Assignment updated',
        description:
          translations?.clientAssignmentSaved ||
          'Client assignment saved successfully.',
      });
    } catch (err) {
      console.error('❌ Failed to update client assignment:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || 'Failed to update client assignment.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingClient((prev) => {
        const next = { ...prev };
        delete next[userCode];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translations?.accessRestricted || 'Access Restricted'}</CardTitle>
          <CardDescription>
            {translations?.insufficientPermissions ||
              'You need elevated permissions to view this page.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {translations?.userManagement || 'User Management'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translations?.userManagementSubtitle ||
              'Assign roles, companies, and client ownership.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadData()}
          disabled={refreshing}
          className="gap-2"
        >
          {refreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {translations?.refreshing || 'Refreshing'}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              {translations?.refresh || 'Refresh'}
            </>
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">
              {translations?.error || 'Error'}
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            {translations?.clientReferralLink || 'Client Referral Link'}
          </CardTitle>
          <CardDescription>
            {translations?.clientReferralLinkSubtitle ||
              'Generate a link to share with clients. When they sign up using this link, they will automatically be assigned to you.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <Input
                value={generateClientReferralLink()}
                readOnly
                className="font-mono text-sm"
                onClick={(e) => e.target.select()}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {translations?.referralLinkHint ||
                  'Click to select and copy, or use the copy button. Clients who sign up using this link will be automatically assigned to you.'}
              </p>
            </div>
            <Button
              onClick={handleCopyReferralLink}
              className="gap-2 md:ml-4"
              disabled={!me?.id}
            >
              <Copy className="h-4 w-4" />
              {translations?.copyLink || 'Copy Link'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {shouldShowInvites && (
        <Card>
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                {translations?.inviteManagementTitle || 'Registration Invitations'}
              </CardTitle>
              <CardDescription>
                {translations?.inviteManagementSubtitle ||
                  'Generate invite codes to control who can register for the platform.'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {showInviteHistory
                  ? `${translations?.total || 'Total'}: ${invites.length}`
                  : `${translations?.active || 'Active'}: ${activeInvitesCount}`}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowInviteHistory((prev) => !prev)}
              >
                {showInviteHistory
                  ? translations?.hideInviteHistory || 'Hide history'
                  : translations?.showInviteHistory || 'Show history'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleCreateInvite} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">{translations?.email || 'Email'}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => handleInviteFieldChange('email', e.target.value)}
                  placeholder="new.dietitian@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">{translations?.role || 'Role'}</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value) => handleInviteFieldChange('role', value)}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder={translations?.role || 'Role'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">
                      {roleLabels.employee || translations?.roleLabelEmployee || 'Employee'}
                    </SelectItem>
                    <SelectItem value="company_manager">
                      {roleLabels.company_manager ||
                        translations?.roleLabelCompanyManager ||
                        'Company Manager'}
                    </SelectItem>
                    <SelectItem value="sys_admin">
                      {roleLabels.sys_admin || translations?.roleLabelSysAdmin || 'System Admin'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-company">{translations?.company || 'Company'}</Label>
                <Select
                  value={inviteForm.companyId}
                  onValueChange={(value) => handleInviteFieldChange('companyId', value)}
                >
                  <SelectTrigger id="invite-company">
                    <SelectValue placeholder={translations?.company || 'Company'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COMPANY_NONE}>
                      {translations?.noCompany || 'No company'}
                    </SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-expiry">
                  {translations?.expiresInHours || 'Expires (hours)'}
                </Label>
                <Input
                  id="invite-expiry"
                  type="number"
                  min="1"
                  value={inviteForm.expiresInHours}
                  onChange={(e) => handleInviteFieldChange('expiresInHours', e.target.value)}
                  placeholder="48"
                />
                <p className="text-xs text-muted-foreground">
                  {translations?.inviteExpiryHint ||
                    'Leave blank to create a code without an expiration.'}
                </p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="invite-notes">{translations?.notes || 'Notes'}</Label>
                <Textarea
                  id="invite-notes"
                  value={inviteForm.notes}
                  onChange={(e) => handleInviteFieldChange('notes', e.target.value)}
                  placeholder={
                    translations?.inviteNotesPlaceholder ||
                    'Optional notes for internal reference.'
                  }
                  rows={3}
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={creatingInvite}>
                  {creatingInvite ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {translations?.creating || 'Creating'}
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {translations?.createInvite || 'Create invitation'}
                    </>
                  )}
                </Button>
              </div>
            </form>

            {invitesError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {invitesError}
              </div>
            )}

            <div className="overflow-x-auto">
              <Table dir={isRTL ? 'rtl' : 'ltr'}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translations?.inviteCodeLabel || 'Code'}</TableHead>
                    <TableHead>{translations?.email || 'Email'}</TableHead>
                    <TableHead>{translations?.role || 'Role'}</TableHead>
                    <TableHead>{translations?.company || 'Company'}</TableHead>
                    <TableHead>{translations?.status || 'Status'}</TableHead>
                    <TableHead>{translations?.expiresAt || 'Expires at'}</TableHead>
                    <TableHead>{translations?.usedAt || 'Used at'}</TableHead>
                    <TableHead className="text-right">
                      {translations?.actions || 'Actions'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitesLoading ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {translations?.loading || 'Loading...'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : visibleInvites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        {showInviteHistory
                          ? translations?.noInvitesYet || 'No invitations created yet.'
                          : translations?.noActiveInvites || 'No active invitations.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleInvites.map((invite) => {
                      const { label: statusLabel, variant: statusVariant } = getInviteStatus(invite);
                      const canRevoke = !invite.revoked_at && !invite.used_at;
                      return (
                        <TableRow key={invite.id || invite.code}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{invite.code}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyCode(invite.code)}
                              >
                                <Copy className="h-4 w-4" />
                                <span className="sr-only">
                                  {translations?.copyCode || 'Copy code'}
                                </span>
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{invite.email}</TableCell>
                          <TableCell>{roleLabels[invite.role] || invite.role}</TableCell>
                          <TableCell>
                            {companyMap.get(invite.company_id) ||
                              (invite.company_id
                                ? invite.company_id
                                : translations?.noCompany || 'No company')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(invite.expires_at)}</TableCell>
                          <TableCell>{formatDateTime(invite.used_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive focus-visible:text-destructive"
                              onClick={() => handleRevokeInvite(invite.code)}
                              disabled={!canRevoke}
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              {translations?.revoke || 'Revoke'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {translations?.teamRoles || 'Team Roles'}
            </CardTitle>
            <CardDescription>
              {translations?.teamRolesSubtitle ||
                'Manage user roles and assign them to companies.'}
            </CardDescription>
          </div>
          <Badge variant="outline">
            {translations?.total || 'Total'}: {profiles.length}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table dir={isRTL ? 'rtl' : 'ltr'}>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.name || 'Name'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.identifier || 'Identifier'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.role || 'Role'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.company || 'Company'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {translations?.noUsersFound || 'No users found.'}
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => {
            const isTargetSysAdmin = profile.role === 'sys_admin';
            const canEditProfile = !(isCompanyManager && isTargetSysAdmin);
                  const currentRoleLabel =
                    roleLabels[profile.role] || translations?.unknown || 'Unknown';
                  const roleOptions =
                    me?.role === 'sys_admin'
                      ? baseRoleOptions
                      : baseRoleOptions.filter((option) => option.value !== 'sys_admin');

                  const isCurrentUser = profile.id === me?.id;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell className={cn('font-medium', isRTL ? 'text-right' : 'text-left')}>
                        <div className="flex items-center gap-2">
                          <span>{profile.name || translations?.noName || 'No name'}</span>
                          {isCurrentUser && (
                            <span className="text-xs text-muted-foreground">me :)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'font-mono text-xs text-muted-foreground',
                          isRTL ? 'text-right' : 'text-left'
                        )}
                      >
                        {profile.id}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={profile.role}
                          onValueChange={(value) => handleRoleChange(profile.id, value)}
                          disabled={
                            Boolean(updatingProfile[profile.id]) || !canEditProfile
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder={currentRoleLabel} />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={profile.company_id || COMPANY_NONE}
                          onValueChange={(value) => handleCompanyChange(profile.id, value)}
                          disabled={
                            Boolean(updatingProfile[profile.id]) ||
                            !canEditProfile ||
                            (me?.role === 'company_manager' &&
                              profile.company_id &&
                              profile.company_id !== me.company_id)
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue
                              placeholder={
                                companyMap.get(profile.company_id) ||
                                translations?.noCompany || 'No company'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={COMPANY_NONE}>
                              {translations?.noCompany || 'No company'}
                            </SelectItem>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-primary" />
              {translations?.clientAssignments || 'Client Assignments'}
            </CardTitle>
            <CardDescription>
              {translations?.clientAssignmentsSubtitle ||
                'Control which team member is responsible for each client.'}
            </CardDescription>
          </div>
          <Badge variant="outline">
            {translations?.total || 'Total'}: {filteredClients.length}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              value={clientSearchTerm}
              onChange={(e) => {
                setClientSearchTerm(e.target.value);
                resetClientPagination();
              }}
              placeholder={
                translations?.searchClients ||
                'Search clients by name, email, code, or phone...'
              }
              className="md:w-80"
            />
            {filteredClients.length > 10 && (
              <span className="text-sm text-muted-foreground">
                {translations?.showing || 'Showing'} {Math.min(displayedClients.length, filteredClients.length)}{' '}
                {translations?.of || 'of'} {filteredClients.length}
              </span>
            )}
          </div>
          <Table dir={isRTL ? 'rtl' : 'ltr'}>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.client || 'Client'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.clientCode || 'Client Code'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.subscriptionStatus || 'Subscription Status'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.subscriptionType || 'Subscription Type'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.subscriptionExpires || 'Expires'}
                </TableHead>
                <TableHead className={cn(isRTL ? 'text-right' : 'text-left')}>
                  {translations?.assignedTo || 'Assigned To'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {clientSearchTerm.trim()
                      ? translations?.noClientsFound || 'No clients found.'
                      : translations?.noClientsFoundGeneral ||
                        'No clients found. Add your first client to get started.'}
                  </TableCell>
                </TableRow>
              ) : (
                displayedClients.map((client) => {
                  const assignedProfile = client.provider_id
                    ? profileMap.get(client.provider_id)
                    : null;

                  const assignableProfiles =
                    me?.role === 'sys_admin'
                      ? profiles
                      : profiles.filter(
                          (p) => p.company_id === me?.company_id && p.role !== 'sys_admin',
                        );

                  const providerIsSysAdmin =
                    assignedProfile?.role === 'sys_admin' && isCompanyManager;

                  const subscriptionInfo = getSubscriptionInfo(client);

                  return (
                    <TableRow key={client.user_code}>
                      <TableCell className={cn('font-medium', isRTL ? 'text-right' : 'text-left')}>
                        {client.full_name}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'font-mono text-xs text-muted-foreground',
                          isRTL ? 'text-right' : 'text-left'
                        )}
                      >
                        {client.user_code}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={subscriptionInfo.isActive || subscriptionInfo.isActiveExpired ? 'default' : 'secondary'}
                          className={
                            subscriptionInfo.isActive
                              ? 'bg-green-500 hover:bg-green-600'
                              : subscriptionInfo.isActiveExpired
                              ? 'bg-yellow-500 hover:bg-yellow-600'
                              : ''
                          }
                        >
                          {subscriptionInfo.isActive
                            ? translations?.active || 'Active'
                            : subscriptionInfo.isActiveExpired
                            ? translations?.active || 'Active'
                            : subscriptionInfo.status
                            ? subscriptionInfo.status.charAt(0).toUpperCase() +
                              subscriptionInfo.status.slice(1).toLowerCase()
                            : translations?.inactive || 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(isRTL ? 'text-right' : 'text-left')}>
                        <span className="text-sm">
                          {formatSubscriptionType(subscriptionInfo.type)}
                        </span>
                      </TableCell>
                      <TableCell className={cn(isRTL ? 'text-right' : 'text-left')}>
                        <span className="text-sm text-muted-foreground">
                          {formatSubscriptionExpiry(subscriptionInfo.expiresAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={client.provider_id || PROVIDER_NONE}
                          onValueChange={(value) =>
                            handleAssignProvider(client.user_code, value)
                          }
                          disabled={
                            Boolean(updatingClient[client.user_code]) || providerIsSysAdmin
                          }
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue
                              placeholder={
                                assignedProfile?.name ||
                                translations?.unassigned || 'Unassigned'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={PROVIDER_NONE}>
                              {translations?.unassigned || 'Unassigned'}
                            </SelectItem>
                            {assignableProfiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                <div className="flex items-center gap-2">
                                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                                  <span>{profile.name || profile.id}</span>
                                  <Badge variant="secondary" className="ml-auto">
                                    {roleLabels[profile.role] || profile.role}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {filteredClients.length > 0 && (
            <div className="mt-4 flex justify-center">
              {canShowMoreClients ? (
                <Button
                  variant="outline"
                  onClick={() => setVisibleClientCount((prev) => prev + 10)}
                >
                  {translations?.showMore || 'Show more'}
                </Button>
              ) : filteredClients.length > 10 ? (
                <Button variant="outline" onClick={() => setVisibleClientCount(10)}>
                  {translations?.showLess || 'Show Less'}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {me?.role === 'sys_admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {translations?.companies || 'Companies'}
            </CardTitle>
            <CardDescription>
              {translations?.companiesSubtitle ||
                'Companies available for assignment. Use the database tools to add or edit companies.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCompany} className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder={translations?.companyNamePlaceholder || 'Enter company name'}
                className="md:w-80"
              />
              <Button type="submit" disabled={creatingCompany}>
                {creatingCompany
                  ? translations?.creating || 'Creating'
                  : translations?.addCompany || 'Add company'}
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {companies.length === 0 ? (
                <Badge variant="outline">
                  {translations?.noCompaniesFound || 'No companies found.'}
                </Badge>
              ) : (
                companies.map((company) => (
                  <Badge key={company.id} variant="outline" className="gap-2">
                    <span>{company.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {company.id}
                    </span>
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

