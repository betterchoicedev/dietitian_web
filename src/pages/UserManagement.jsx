import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Users as UsersIcon, Building2, RefreshCw, Loader2, UserCheck, UserPlus, Ban, Copy } from 'lucide-react';
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
          : profileRows.filter((p) => p.company_id === currentProfile.company_id);

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
            <Badge variant="outline">
              {translations?.total || 'Total'}: {invites.length}
            </Badge>
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
                  ) : invites.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        {translations?.noInvitesYet || 'No invitations created yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    invites.map((invite) => {
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

                  return (
                    <TableRow key={profile.id}>
                      <TableCell className={cn('font-medium', isRTL ? 'text-right' : 'text-left')}>
                        {profile.name || translations?.noName || 'No name'}
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
            {translations?.total || 'Total'}: {clients.length}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
                  {translations?.assignedTo || 'Assigned To'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {translations?.noClientsFound || 'No clients found.'}
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => {
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

