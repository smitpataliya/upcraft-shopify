import React, { useState, useEffect, useMemo } from 'react';
import {
  ConfigProvider, theme, Layout, Menu, Table, Button, Card, Row, Col,
  Statistic, Tag, Badge, Input, Radio, Modal, Alert, Form, Switch,
  InputNumber, Space, Typography, Tooltip, Divider, Progress, List,
  Avatar, Dropdown, message, Segmented, Empty
} from 'antd';
import {
  ShoppingOutlined, HistoryOutlined, SafetyCertificateOutlined,
  SettingOutlined, LogoutOutlined, UserOutlined, ThunderboltOutlined,
  SyncOutlined, DownloadOutlined, CheckCircleOutlined,
  WarningOutlined, ArrowRightOutlined, SearchOutlined,
  CheckOutlined, ShopOutlined, EyeOutlined, LockOutlined,
  PhoneOutlined, EnvironmentOutlined, GlobalOutlined, FilterOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined, EditOutlined,
  InfoCircleOutlined, FileTextOutlined, CompassOutlined,
  PlusOutlined, DeleteOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';

const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;

const API_BASE = '/api';

export default function App() {
  // Navigation layout state
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Auth state
  const [token, setToken] = useState(localStorage.getItem('upcraft_token') || '');
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'Upcraft2026!' });
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState('drafts'); // 'drafts', 'bulk', 'history', 'audit', 'settings'

  // Drafts state
  const [drafts, setDrafts] = useState([]);
  const [pageInfo, setPageInfo] = useState({ hasNextPage: false, hasPreviousPage: false, endCursor: null });
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'COD_ONLY', 'NON_COD', 'FLAGGED'
  const [pageSize, setPageSize] = useState(25);

  // Bulk Staging Queue State (Persisted across sessions)
  const [bulkQueue, setBulkQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('upcraft_bulk_staged_drafts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [bulkFilter, setBulkFilter] = useState('ALL'); // 'ALL', 'READY', 'NEEDS_FIX'
  const [reviewDrafts, setReviewDrafts] = useState([]); // Drafts targeted for current review modal

  const saveBulkQueue = (newQueue) => {
    setBulkQueue(newQueue);
    try {
      localStorage.setItem('upcraft_bulk_staged_drafts', JSON.stringify(newQueue));
    } catch (e) {
      console.error('Failed to save bulk queue:', e);
    }
  };

  const moveToBulk = (draft) => {
    const exists = bulkQueue.some(d => d.id === draft.id);
    if (exists) {
      setActiveTab('bulk');
      return;
    }
    const max = config?.max_batch_size || 70;
    if (bulkQueue.length >= max) {
      message.warning(`Maximum bulk batch cap of ${max} reached.`);
      return;
    }
    const updated = [...bulkQueue, draft];
    saveBulkQueue(updated);
    if (selectedMap.has(draft.id)) {
      setSelectedMap(prev => {
        const next = new Map(prev);
        next.delete(draft.id);
        return next;
      });
    }
    message.success(`Moved ${draft.name} to Bulk Orders page!`);
    setActiveTab('bulk');
  };

  const toggleBulkQueue = moveToBulk;

  const addSelectedToBulk = () => {
    const selectedList = Array.from(selectedMap.values());
    if (selectedList.length === 0) return;
    const max = config?.max_batch_size || 70;
    const existingIds = new Set(bulkQueue.map(d => d.id));
    const newToAdd = selectedList.filter(d => !existingIds.has(d.id));
    if (newToAdd.length === 0) {
      message.info('All selected drafts are already in Bulk Queue.');
      setActiveTab('bulk');
      return;
    }
    let updated;
    if (bulkQueue.length + newToAdd.length > max) {
      const allowed = newToAdd.slice(0, max - bulkQueue.length);
      updated = [...bulkQueue, ...allowed];
      saveBulkQueue(updated);
      setSelectedMap(new Map());
      message.warning(`Moved ${allowed.length} drafts to Bulk Orders (batch cap of ${max} reached).`);
    } else {
      updated = [...bulkQueue, ...newToAdd];
      saveBulkQueue(updated);
      setSelectedMap(new Map());
      message.success(`Moved ${newToAdd.length} draft(s) to Bulk Orders page!`);
    }
    setActiveTab('bulk');
  };

  const removeFromBulkQueue = (id) => {
    const removed = bulkQueue.find(d => d.id === id);
    const updated = bulkQueue.filter(d => d.id !== id);
    saveBulkQueue(updated);
    message.info(`Returned ${removed?.name || 'draft'} to Draft Orders page.`);
  };

  const clearBulkQueue = () => {
    saveBulkQueue([]);
    message.info('Bulk Queue cleared. All drafts returned to Draft Orders page.');
  };

  // Cross-page selection Map: draftId -> draftObject
  const [selectedMap, setSelectedMap] = useState(new Map());

  // Store config
  const [config, setConfig] = useState(null);
  const [configFeedback, setConfigFeedback] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Modals & Active Job
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [singleTestModal, setSingleTestModal] = useState(null);
  const [viewDraftModal, setViewDraftModal] = useState(null);
  const [editDraftModal, setEditDraftModal] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [editForm] = Form.useForm();

  // History & Audit
  const [jobsHistory, setJobsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Helper auth fetch
  const authFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      setToken('');
      setUser(null);
      localStorage.removeItem('upcraft_token');
    }
    return res;
  };

  // Check current auth
  useEffect(() => {
    if (token) {
      authFetch(`${API_BASE}/auth/me`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setUser(data.user);
          } else {
            setToken('');
            localStorage.removeItem('upcraft_token');
          }
        })
        .catch(() => {
          setToken('');
        });
    }
  }, [token]);

  // Load store config
  const fetchConfig = async () => {
    try {
      const res = await authFetch(`${API_BASE}/config`);
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch (e) {
      console.error('Config fetch failed:', e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchConfig();
    }
  }, [user]);

  // Load drafts
  const fetchDrafts = async (afterCursor = null) => {
    setLoadingDrafts(true);
    try {
      const q = 'status:OPEN';
      const url = `${API_BASE}/draft-orders?first=${pageSize}&query=${encodeURIComponent(q)}${afterCursor ? `&after=${afterCursor}` : ''}`;
      const res = await authFetch(url);
      const json = await res.json();
      if (json.success) {
        setDrafts(json.data.nodes || []);
        setPageInfo(json.data.pageInfo || {});
      } else {
        message.error(json.error || 'Failed to fetch draft orders');
      }
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'drafts') {
      fetchDrafts();
    } else if (user && activeTab === 'history') {
      fetchJobsHistory();
    } else if (user && activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [user, activeTab, pageSize]);

  // Poll active job while running
  useEffect(() => {
    let interval = null;
    if (activeJob && (activeJob.status === 'RUNNING' || activeJob.status === 'PENDING')) {
      interval = setInterval(async () => {
        try {
          const res = await authFetch(`${API_BASE}/bulk-jobs/${activeJob.id}`);
          const json = await res.json();
          if (json.success) {
            setActiveJob(json.data);
            if (json.data.status !== 'RUNNING' && json.data.status !== 'PENDING') {
              fetchDrafts();
              message.success(`Bulk job #${json.data.id.slice(0, 8)} ${json.data.status.toLowerCase()}!`);
            }
          }
        } catch (e) {
          console.error('Job polling error:', e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeJob]);

  // Handlers
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('upcraft_token', data.token);
        message.success(`Welcome, ${data.user.fullName}`);
      } else {
        const errMsg = data.message || 'Login failed: check username and password';
        setLoginError(errMsg);
        message.error(errMsg);
      }
    } catch (err) {
      const errMsg = `Connection error: ${err.message}. Is server running?`;
      setLoginError(errMsg);
      message.error(errMsg);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (e) {}
    setToken('');
    setUser(null);
    localStorage.removeItem('upcraft_token');
    message.info('Logged out');
  };

  // Selection toggle
  const onSelectChange = (newSelectedRowKeys) => {
    if (newSelectedRowKeys.length > 70) {
      message.warning('Selection cap reached: Maximum 70 drafts per bulk batch.');
      return;
    }
    const nextMap = new Map();
    // Keep previously selected items outside current page
    for (const [id, draft] of selectedMap.entries()) {
      if (newSelectedRowKeys.includes(id)) {
        nextMap.set(id, draft);
      }
    }
    // Add newly selected from current drafts
    for (const key of newSelectedRowKeys) {
      const found = drafts.find(d => d.id === key);
      if (found) {
        nextMap.set(key, found);
      } else if (selectedMap.has(key)) {
        nextMap.set(key, selectedMap.get(key));
      }
    }
    setSelectedMap(nextMap);
  };

  const selectAllOnPage = () => {
    const nextMap = new Map(selectedMap);
    for (const d of filteredDrafts) {
      if (nextMap.size >= 70) break;
      nextMap.set(d.id, d);
    }
    setSelectedMap(nextMap);
    message.info(`Selected ${nextMap.size} drafts`);
  };

  const clearSelection = () => {
    setSelectedMap(new Map());
    message.info('Selection cleared');
  };

  // Edit Draft Modal Form Opener
  const openEditModal = (draft) => {
    setEditDraftModal(draft);
    editForm.setFieldsValue({
      firstName: draft.shippingAddress?.firstName || draft.customer?.firstName || '',
      lastName: draft.shippingAddress?.lastName || draft.customer?.lastName || '',
      phone: draft.phone || draft.customer?.phone || draft.shippingAddress?.phone || '',
      email: draft.email || draft.customer?.email || '',
      address1: draft.shippingAddress?.address1 || '',
      address2: draft.shippingAddress?.address2 || '',
      city: draft.shippingAddress?.city || '',
      province: draft.shippingAddress?.province || '',
      zip: draft.shippingAddress?.zip || '',
      country: draft.shippingAddress?.country || 'India',
      addCodTag: !draft.tags?.some(t => t.toUpperCase() === (config?.cod_marker_value || 'COD').toUpperCase())
    });
  };

  const handleSaveDraft = async () => {
    try {
      const values = await editForm.validateFields();
      setSavingDraft(true);
      const numericId = String(editDraftModal.id).replace(/\D/g, '');
      const res = await authFetch(`${API_BASE}/draft-orders/${numericId}`, {
        method: 'PUT',
        body: JSON.stringify({
          id: editDraftModal.id,
          shippingAddress: {
            firstName: values.firstName,
            lastName: values.lastName,
            address1: values.address1,
            address2: values.address2,
            city: values.city,
            province: values.province,
            zip: values.zip,
            country: values.country,
            phone: values.phone
          },
          phone: values.phone,
          email: values.email,
          addCodTag: values.addCodTag,
          tags: values.addCodTag && !editDraftModal.tags?.includes(config?.cod_marker_value || 'COD')
            ? [...(editDraftModal.tags || []), (config?.cod_marker_value || 'COD')]
            : editDraftModal.tags
        })
      });

      let json;
      try {
        json = await res.json();
      } catch (parseErr) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      if (json.success) {
        message.success(json.message);
        setDrafts(prev => prev.map(d => d.id === editDraftModal.id ? json.data : d));
        setBulkQueue(prev => {
          const updated = prev.map(d => d.id === editDraftModal.id ? json.data : d);
          try {
            localStorage.setItem('upcraft_bulk_staged_drafts', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        setSelectedMap(prev => {
          if (prev.has(editDraftModal.id)) {
            const next = new Map(prev);
            next.set(editDraftModal.id, json.data);
            return next;
          }
          return prev;
        });
        if (viewDraftModal && viewDraftModal.id === editDraftModal.id) {
          setViewDraftModal(json.data);
        }
        setEditDraftModal(null);
      } else {
        message.error(json.message || 'Failed to update draft');
      }
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Single test run
  const handleSingleTest = async (draft) => {
    if (!draft.isAddressComplete) {
      message.warning(`Cannot convert ${draft.name}: missing ${draft.missingFields?.filter(f => f !== 'COD Tag').join(', ')}. Please edit address details first.`);
      openEditModal(draft);
      return;
    }

    try {
      message.loading({ content: `Testing draft ${draft.name}...`, key: 'single-test' });
      const res = await authFetch(`${API_BASE}/draft-orders/test-single`, {
        method: 'POST',
        body: JSON.stringify({ id: draft.id })
      });
      const json = await res.json();
      if (json.success) {
        message.success({ content: json.message, key: 'single-test' });
        setSingleTestModal(json.data);
        fetchDrafts();
      } else {
        message.error({ content: json.message || 'Single test failed', key: 'single-test' });
      }
    } catch (e) {
      message.error({ content: e.message, key: 'single-test' });
    }
  };

  // Bulk Job Submission
  const handleCreateAndStartJob = async () => {
    const draftsToSubmit = reviewDrafts.length > 0 ? reviewDrafts : Array.from(selectedMap.values());
    if (draftsToSubmit.length === 0) return;

    const incomplete = draftsToSubmit.filter(d => !d.isAddressComplete || !d.isCodEligible);
    if (incomplete.length > 0) {
      message.error(`Cannot start bulk confirmation: ${incomplete.length} draft(s) have incomplete delivery details or missing COD tag. Please edit them first.`);
      return;
    }

    try {
      message.loading({ content: 'Initializing bulk confirmation job...', key: 'bulk-start' });
      const res = await authFetch(`${API_BASE}/bulk-jobs`, {
        method: 'POST',
        body: JSON.stringify({ drafts: draftsToSubmit })
      });
      const json = await res.json();
      if (!json.success) {
        message.error({ content: json.error || 'Failed to create job', key: 'bulk-start' });
        return;
      }

      const job = json.data;
      const startRes = await authFetch(`${API_BASE}/bulk-jobs/${job.id}/start`, { method: 'POST' });
      const startJson = await startRes.json();

      if (startJson.success) {
        setActiveJob(startJson.data);
        setShowReviewModal(false);
        setConfirmPhrase('');
        // Clean converted drafts from bulk queue & selection
        const submittedIds = new Set(draftsToSubmit.map(d => d.id));
        const remainingQueue = bulkQueue.filter(d => !submittedIds.has(d.id));
        saveBulkQueue(remainingQueue);
        clearSelection();
        setReviewDrafts([]);
        setShowJobModal(true);
        message.success({ content: `Bulk job started for ${draftsToSubmit.length} drafts!`, key: 'bulk-start' });
      }
    } catch (e) {
      message.error({ content: e.message, key: 'bulk-start' });
    }
  };

  // Reconcile item
  const handleReconcileItem = async (itemId) => {
    if (!activeJob) return;
    try {
      message.loading({ content: 'Reconciling item with Shopify Admin GraphQL...', key: 'reconcile' });
      const res = await authFetch(`${API_BASE}/bulk-jobs/${activeJob.id}/items/${itemId}/reconcile`, {
        method: 'POST'
      });
      const json = await res.json();
      if (json.success) {
        message.success({ content: json.message, key: 'reconcile' });
      } else {
        message.warning({ content: json.message, key: 'reconcile' });
      }

      const jobRes = await authFetch(`${API_BASE}/bulk-jobs/${activeJob.id}`);
      const jobData = await jobRes.json();
      if (jobData.success) setActiveJob(jobData.data);
    } catch (e) {
      message.error({ content: e.message, key: 'reconcile' });
    }
  };

  // Cancel job
  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      const res = await authFetch(`${API_BASE}/bulk-jobs/${activeJob.id}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setActiveJob(json.data);
        message.warning('Job cancellation requested. Unprocessed drafts stopped.');
      }
    } catch (e) {
      message.error(e.message);
    }
  };

  // History & Audit loaders
  const fetchJobsHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch(`${API_BASE}/bulk-jobs`);
      const json = await res.json();
      if (json.success) setJobsHistory(json.data || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await authFetch(`${API_BASE}/audit-logs`);
      const json = await res.json();
      if (json.success) setAuditLogs(json.data || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Filter out drafts that have been moved to bulkQueue
  const unstagedDrafts = useMemo(() => {
    const bulkIds = new Set(bulkQueue.map(d => d.id));
    return drafts.filter(d => !bulkIds.has(d.id));
  }, [drafts, bulkQueue]);

  // Filtered drafts calculation (using unstagedDrafts)
  const filteredDrafts = useMemo(() => {
    let list = unstagedDrafts;
    if (activeFilter === 'COD_ONLY') {
      list = list.filter(d => d.isCodEligible);
    } else if (activeFilter === 'NON_COD') {
      list = list.filter(d => !d.isCodEligible);
    } else if (activeFilter === 'FLAGGED') {
      list = list.filter(d => d.flags && d.flags.length > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d => {
        const name = (d.name || '').toLowerCase();
        const cust = `${d.customer?.firstName || ''} ${d.customer?.lastName || ''}`.toLowerCase();
        const phone = (d.phone || d.customer?.phone || '').toLowerCase();
        const email = (d.email || d.customer?.email || '').toLowerCase();
        const tags = Array.isArray(d.tags) ? d.tags.join(' ').toLowerCase() : '';
        return name.includes(q) || cust.includes(q) || phone.includes(q) || email.includes(q) || tags.includes(q);
      });
    }

    return list;
  }, [unstagedDrafts, activeFilter, searchQuery]);

  // Selected total value
  const selectedTotal = useMemo(() => {
    return Array.from(selectedMap.values()).reduce((sum, d) => {
      const amt = parseFloat(d.totalPriceSet?.shopMoney?.amount || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
  }, [selectedMap]);

  // Bulk Queue computations
  const bulkReadyDrafts = useMemo(() => {
    return bulkQueue.filter(d => d.isAddressComplete && d.isCodEligible);
  }, [bulkQueue]);

  const bulkBrokenDrafts = useMemo(() => {
    return bulkQueue.filter(d => !d.isAddressComplete || !d.isCodEligible);
  }, [bulkQueue]);

  const bulkReadyTotal = useMemo(() => {
    return bulkReadyDrafts.reduce((sum, d) => {
      const amt = parseFloat(d.totalPriceSet?.shopMoney?.amount || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
  }, [bulkReadyDrafts]);

  const filteredBulkDrafts = useMemo(() => {
    if (bulkFilter === 'READY') return bulkReadyDrafts;
    if (bulkFilter === 'NEEDS_FIX') return bulkBrokenDrafts;
    return bulkQueue;
  }, [bulkQueue, bulkFilter, bulkReadyDrafts, bulkBrokenDrafts]);

  // Ant Design Table Columns for Draft Orders
  const draftColumns = [
    {
      title: 'Draft Order',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (text, record) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', fontSize: 13 }}>
              {text}
            </span>
            {record.flags?.includes('HIGH_VALUE') && (
              <Tag color="gold" style={{ fontSize: 10, padding: '0 4px', margin: 0, fontWeight: 600 }}>
                High Value
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {new Date(record.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )
    },
    {
      title: 'Customer & Delivery Contact',
      key: 'customer',
      width: 250,
      render: (_, record) => {
        const phone = record.phone || record.customer?.phone || record.shippingAddress?.phone;
        const city = record.shippingAddress?.city;
        const state = record.shippingAddress?.province;
        const zip = record.shippingAddress?.zip;
        const recipientName = record.shippingAddress?.name || `${record.customer?.firstName || ''} ${record.customer?.lastName || ''}`.trim() || 'Guest Customer';

        return (
          <div>
            <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              {recipientName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 11, marginTop: 4 }}>
              {phone ? (
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <PhoneOutlined style={{ fontSize: 10, color: '#64748b' }} />
                  {phone}
                </span>
              ) : (
                <Tag color="error" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  No Phone
                </Tag>
              )}
              <span style={{ color: '#475569' }}>•</span>
              {city ? (
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <EnvironmentOutlined style={{ fontSize: 10, color: '#64748b' }} />
                  {city}{state ? `, ${state}` : ''}{zip ? ` (${zip})` : ''}
                </span>
              ) : (
                <Tag color="error" style={{ fontSize: 10, margin: 0, padding: '0 4px', cursor: 'pointer' }} onClick={() => openEditModal(record)}>
                  Missing City
                </Tag>
              )}
            </div>
          </div>
        );
      }
    },
    {
      title: 'Line Items Summary',
      key: 'lineItems',
      ellipsis: true,
      render: (_, record) => {
        const items = record.lineItems?.nodes || [];
        const firstTitle = items[0]?.title || items[0]?.name || 'Order Item';
        return (
          <div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280, color: '#cbd5e1', fontSize: 12 }} title={firstTitle}>
              {firstTitle}
            </div>
            {items.length > 1 && (
              <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2, fontWeight: 500 }}>
                +{items.length - 1} more item{items.length > 2 ? 's' : ''} (click + to view)
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Total Amount',
      key: 'total',
      align: 'right',
      width: 130,
      sorter: (a, b) => parseFloat(a.totalPriceSet?.shopMoney?.amount || 0) - parseFloat(b.totalPriceSet?.shopMoney?.amount || 0),
      render: (_, record) => {
        const amt = parseFloat(record.totalPriceSet?.shopMoney?.amount || 0);
        return (
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#34d399', whiteSpace: 'nowrap' }}>
            ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        );
      }
    },
    {
      title: 'Status & Readiness',
      key: 'status',
      width: 160,
      render: (_, record) => {
        if (!record.isAddressComplete) {
          const missing = record.missingFields?.filter(f => f !== 'COD Tag').join(', ') || 'Address Info';
          return (
            <Tooltip title={`Incomplete Delivery Info: Missing ${missing}. Click to edit and fix.`}>
              <Tag
                color="error"
                onClick={() => openEditModal(record)}
                style={{ cursor: 'pointer', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}
              >
                <WarningOutlined style={{ marginRight: 4 }} /> Missing: {missing.length > 16 ? missing.slice(0, 16) + '...' : missing}
              </Tag>
            </Tooltip>
          );
        }
        if (!record.isCodEligible) {
          return (
            <Tooltip title="Delivery details complete, but missing COD tag. Click Fix to add COD tag.">
              <Tag
                color="warning"
                onClick={() => openEditModal(record)}
                style={{ cursor: 'pointer', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}
              >
                Non-COD Tag
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="success" style={{ fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}>
            <CheckOutlined style={{ marginRight: 4 }} /> COD Ready
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 320,
      render: (_, record) => {
        return (
          <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Tooltip title="Move this draft order to Bulk Orders page">
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => moveToBulk(record)}
                style={{
                  background: '#2563eb',
                  borderColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: 6
                }}
              >
                + Bulk
              </Button>
            </Tooltip>
            <Tooltip title="View full draft order details (Customer, items, address, taxes)">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setViewDraftModal(record)}
                style={{ background: '#1e293b', borderColor: '#334155', color: '#cbd5e1' }}
              >
                Details
              </Button>
            </Tooltip>
            <Tooltip title="Edit / Add missing shipping address or phone">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEditModal(record)}
                style={{
                  background: !record.isAddressComplete ? '#7c2d12' : '#1e293b',
                  borderColor: !record.isAddressComplete ? '#ea580c' : '#334155',
                  color: !record.isAddressComplete ? '#fdba74' : '#94a3b8'
                }}
              >
                Fix
              </Button>
            </Tooltip>
            <Tooltip title={!record.isCodEligible ? "Complete missing address fields or add COD tag to test" : "Test COD conversion for this single draft"}>
              <Button
                size="small"
                type="primary"
                ghost={record.isCodEligible}
                disabled={!record.isCodEligible}
                icon={<ThunderboltOutlined />}
                onClick={() => handleSingleTest(record)}
                style={{ fontWeight: 600, borderRadius: 6 }}
              >
                Test
              </Button>
            </Tooltip>
          </div>
        );
      }
    }
  ];

  // Expanded row showing all line items
  const expandedRowRender = (record) => {
    const items = record.lineItems?.nodes || [];
    return (
      <div style={{ margin: '4px 0', background: '#0b1329', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 12, color: '#38bdf8' }}>
            Line Items breakdown for {record.name}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Shipping: {record.shippingAddress?.address1}, {record.shippingAddress?.city}, {record.shippingAddress?.province} {record.shippingAddress?.zip}
          </Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: idx < items.length - 1 ? '1px dashed #1e293b' : 'none' }}>
              <span style={{ color: '#e2e8f0' }}>
                <span style={{ color: '#94a3b8', marginRight: 6, fontWeight: 600 }}>{it.quantity}×</span>
                {it.title}
              </span>
              <span style={{ fontFamily: 'monospace', color: '#34d399', fontWeight: 600 }}>
                ₹{(parseFloat(it.originalUnitPriceSet?.shopMoney?.amount || 0) * it.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Bulk Queue Table Columns
  const bulkColumns = [
    {
      title: 'Draft Order',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (text, record) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{text}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {new Date(record.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </div>
        </div>
      )
    },
    {
      title: 'Customer & Delivery Contact',
      key: 'customer',
      width: 250,
      render: (_, record) => {
        const custName = `${record.customer?.firstName || ''} ${record.customer?.lastName || ''}`.trim() || 'Guest Customer';
        const phone = record.phone || record.customer?.phone || record.shippingAddress?.phone || 'No phone';
        const city = record.shippingAddress?.city || 'No city';
        const prov = record.shippingAddress?.province || '';
        const zip = record.shippingAddress?.zip || 'No zip';
        return (
          <div>
            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{custName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <PhoneOutlined style={{ fontSize: 10, color: phone === 'No phone' ? '#ef4444' : '#64748b' }} />
              <span style={{ color: phone === 'No phone' ? '#f87171' : '#cbd5e1' }}>{phone}</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <EnvironmentOutlined style={{ fontSize: 10 }} />
              <span>{city}{prov ? `, ${prov}` : ''} ({zip})</span>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Line Items Summary',
      key: 'items',
      width: 240,
      render: (_, record) => {
        const items = record.lineItems?.nodes || [];
        const firstTitle = items[0]?.title || 'Unknown Item';
        return (
          <div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220, color: '#cbd5e1', fontSize: 12 }} title={firstTitle}>
              {firstTitle}
            </div>
            {items.length > 1 && (
              <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2, fontWeight: 500 }}>
                +{items.length - 1} more item{items.length > 2 ? 's' : ''} (click + to view)
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Total Amount',
      key: 'total',
      align: 'right',
      width: 120,
      render: (_, record) => {
        const amt = parseFloat(record.totalPriceSet?.shopMoney?.amount || 0);
        return (
          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#34d399', whiteSpace: 'nowrap' }}>
            ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        );
      }
    },
    {
      title: 'Status & Readiness',
      key: 'status',
      width: 180,
      render: (_, record) => {
        if (!record.isAddressComplete) {
          const missing = record.missingFields?.filter(f => f !== 'COD Tag').join(', ') || 'Address Info';
          return (
            <Tooltip title={`Incomplete Delivery Info: Missing ${missing}. Click to edit and fix.`}>
              <Tag
                color="error"
                onClick={() => openEditModal(record)}
                style={{ cursor: 'pointer', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}
              >
                <WarningOutlined style={{ marginRight: 4 }} /> Missing: {missing.length > 16 ? missing.slice(0, 16) + '...' : missing}
              </Tag>
            </Tooltip>
          );
        }
        if (!record.isCodEligible) {
          return (
            <Tooltip title="Missing COD Tag. Click Fix to add COD tag.">
              <Tag
                color="warning"
                onClick={() => openEditModal(record)}
                style={{ cursor: 'pointer', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}
              >
                Non-COD Tag
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="success" style={{ fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}>
            <CheckOutlined style={{ marginRight: 4 }} /> COD Ready
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 200,
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Tooltip title="View full draft order details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setViewDraftModal(record)}
              style={{ background: '#1e293b', borderColor: '#334155', color: '#cbd5e1' }}
            >
              Details
            </Button>
          </Tooltip>
          <Tooltip title="Edit / Add missing shipping address or phone">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              style={{
                background: !record.isAddressComplete ? '#7c2d12' : '#1e293b',
                borderColor: !record.isAddressComplete ? '#ea580c' : '#334155',
                color: !record.isAddressComplete ? '#fdba74' : '#94a3b8'
              }}
            >
              Fix
            </Button>
          </Tooltip>
          <Tooltip title="Remove from Bulk Queue">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeFromBulkQueue(record.id)}
              style={{ background: 'rgba(239, 68, 68, 0.1)' }}
            />
          </Tooltip>
        </div>
      )
    }
  ];

  // Ant Design Dark Theme Configuration
  const antdTheme = {
    algorithm: theme.darkAlgorithm,
    token: {
      colorPrimary: '#2563eb',
      colorSuccess: '#10b981',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',
      colorBgBase: '#090d16',
      colorBgContainer: '#0f172a',
      colorBorder: '#1e293b',
      colorBorderSecondary: '#1e293b',
      borderRadius: 8,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    components: {
      Layout: {
        headerBg: '#090d16',
        headerPadding: '0 24px',
        headerHeight: 68
      },
      Table: {
        headerBg: '#0b1329',
        headerColor: '#94a3b8',
        rowHoverBg: 'rgba(30, 41, 59, 0.45)',
        borderColor: '#1e293b'
      },
      Card: {
        colorBgContainer: '#0f172a',
        colorBorderSecondary: '#1e293b'
      }
    }
  };

  // Login Screen
  if (!user) {
    return (
      <ConfigProvider theme={antdTheme}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', padding: 16 }}>
          <Card
            style={{ maxWidth: 440, width: '100%', borderColor: '#1e293b', background: '#0f172a', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}
            bordered
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar size={48} icon={<ShopOutlined />} style={{ backgroundColor: '#2563eb', borderRadius: 12 }} />
                <div>
                  <Title level={4} style={{ margin: 0, color: '#ffffff', letterSpacing: -0.3 }}>Upcraft Shopify</Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>Bulk COD Draft Order Confirmation Portal</Text>
                </div>
              </div>

              <Alert
                message="Shopify Admin GraphQL API 2026-10"
                description="Internal operations dashboard to convert Cash-on-Delivery draft orders into official Shopify orders in batches up to 70."
                type="info"
                showIcon
                style={{ background: 'rgba(37, 99, 235, 0.08)', borderColor: 'rgba(37, 99, 235, 0.25)' }}
              />

              {loginError && (
                <Alert
                  message="Authentication Error"
                  description={loginError}
                  type="error"
                  showIcon
                  closable
                  onClose={() => setLoginError('')}
                />
              )}

              <form onSubmit={handleLogin} style={{ width: '100%' }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                    Staff Username
                  </label>
                  <Input
                    prefix={<UserOutlined style={{ color: '#64748b' }} />}
                    value={loginForm.username}
                    onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                    onPressEnter={handleLogin}
                    placeholder="admin or operator"
                    size="large"
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 }}>
                    Password
                  </label>
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#64748b' }} />}
                    value={loginForm.password}
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    onPressEnter={handleLogin}
                    size="large"
                  />
                </div>

                <Button
                  type="primary"
                  htmlType="submit"
                  onClick={handleLogin}
                  block
                  size="large"
                  loading={loggingIn}
                  style={{ height: 44, fontWeight: 600, background: '#2563eb', borderColor: '#2563eb' }}
                >
                  Sign In to Operations Console
                </Button>
              </form>

              <div style={{ textAlign: 'center', paddingTop: 8, borderTop: '1px solid #1e293b' }}>
                <Space direction="vertical" size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Quick-fill demo account:</Text>
                  <Space>
                    <Tag
                      color="blue"
                      style={{ cursor: 'pointer', padding: '2px 8px' }}
                      onClick={() => setLoginForm({ username: 'admin', password: 'Upcraft2026!' })}
                    >
                      admin (Admin)
                    </Tag>
                    <Tag
                      color="green"
                      style={{ cursor: 'pointer', padding: '2px 8px' }}
                      onClick={() => setLoginForm({ username: 'operator', password: 'Operator2026!' })}
                    >
                      operator (Clerk)
                    </Tag>
                  </Space>
                </Space>
              </div>
            </Space>
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  // User menu items
  const userMenuItems = [
    {
      key: 'profile',
      label: (
        <div style={{ padding: '4px 0' }}>
          <Text strong style={{ display: 'block', color: '#f8fafc' }}>{user.fullName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{user.email}</Text>
        </div>
      )
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: handleLogout
    }
  ];

  return (
    <ConfigProvider theme={antdTheme}>
      <Layout style={{ minHeight: '100vh', background: '#090d16' }}>
        {/* Left Sidebar (AppSidebar style matching upcraft-admin-panel) */}
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={260}
          collapsedWidth={80}
          style={{
            background: '#090d16',
            borderRight: '1px solid #1e293b',
            height: '100vh',
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 100
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
            {/* Top Area: Logo, Store Chip, Navigation Items */}
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {/* Brand Header */}
              <div style={{
                padding: collapsed ? '18px 12px' : '18px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: '1px solid #1e293b'
              }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 800,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                  flexShrink: 0
                }}>
                  UP
                </div>
                {!collapsed && (
                  <div style={{ lineHeight: 1.2, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: 16, letterSpacing: -0.3 }}>
                        Upcraft.Tech
                      </span>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>Shopify COD</span>
                      <Tag color="geekblue" style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '14px', borderRadius: 3 }}>
                        API 2026-10
                      </Tag>
                    </div>
                  </div>
                )}
              </div>

              {/* Store Domain Switcher / Pill */}
              {!collapsed ? (
                <div style={{ padding: '12px 14px 6px' }}>
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <ShopOutlined style={{ color: '#38bdf8', fontSize: 14 }} />
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {config?.store_domain?.split('.')[0] || 'upcraft-store'}
                        </div>
                        <div style={{ color: config?.mock_mode ? '#10b981' : '#38bdf8', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: config?.mock_mode ? '#10b981' : '#38bdf8' }} />
                          {config?.mock_mode ? 'Mock Mode' : 'Live Store API'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 0', textAlign: 'center' }}>
                  <Tooltip title={`${config?.store_domain || 'Shopify Store'} (${config?.mock_mode ? 'Mock Mode' : 'Live API'})`} placement="right">
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#38bdf8'
                    }}>
                      <ShopOutlined />
                    </div>
                  </Tooltip>
                </div>
              )}

              {/* Nav Search Input */}
              {!collapsed && (
                <div style={{ padding: '6px 14px 6px' }}>
                  <Input
                    size="small"
                    placeholder="Search navigation..."
                    prefix={<SearchOutlined style={{ color: '#64748b', fontSize: 12 }} />}
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                    allowClear
                    style={{
                      background: '#090d16',
                      borderColor: '#1e293b',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#f8fafc'
                    }}
                  />
                </div>
              )}

              {/* Grouped Sidebar Navigation Items */}
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Section: OVERVIEW */}
                <div>
                  {!collapsed && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      marginBottom: 4
                    }}>
                      Overview
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      { key: 'drafts', icon: <ShoppingOutlined />, label: 'Draft Orders', badge: null },
                      {
                        key: 'bulk',
                        icon: <ThunderboltOutlined />,
                        label: 'Bulk Orders',
                        badge: bulkQueue.length > 0 ? bulkQueue.length : null
                      }
                    ].filter(item => !sidebarSearch || item.label.toLowerCase().includes(sidebarSearch.toLowerCase())).map(item => {
                      const isActive = activeTab === item.key;
                      return (
                        <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                          <button
                            onClick={() => setActiveTab(item.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: collapsed ? 'center' : 'space-between',
                              width: '100%',
                              padding: collapsed ? '10px 0' : '9px 12px',
                              borderRadius: 10,
                              border: 'none',
                              background: isActive ? '#2563eb' : 'transparent',
                              color: isActive ? '#ffffff' : '#94a3b8',
                              fontWeight: isActive ? 600 : 500,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1e293b'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 16, display: 'flex', color: isActive ? '#ffffff' : '#94a3b8' }}>{item.icon}</span>
                              {!collapsed && <span>{item.label}</span>}
                            </div>
                            {!collapsed && item.badge !== null && (
                              <span style={{
                                background: isActive ? 'rgba(255,255,255,0.25)' : '#1e293b',
                                color: isActive ? '#ffffff' : '#38bdf8',
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 9999
                              }}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Section: OPERATIONS */}
                <div>
                  {!collapsed && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      marginBottom: 4
                    }}>
                      Operations
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      { key: 'history', icon: <HistoryOutlined />, label: 'Bulk Jobs History', badge: null },
                      { key: 'audit', icon: <SafetyCertificateOutlined />, label: 'Audit Trail', badge: null }
                    ].filter(item => !sidebarSearch || item.label.toLowerCase().includes(sidebarSearch.toLowerCase())).map(item => {
                      const isActive = activeTab === item.key;
                      return (
                        <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                          <button
                            onClick={() => setActiveTab(item.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: collapsed ? 'center' : 'space-between',
                              width: '100%',
                              padding: collapsed ? '10px 0' : '9px 12px',
                              borderRadius: 10,
                              border: 'none',
                              background: isActive ? '#2563eb' : 'transparent',
                              color: isActive ? '#ffffff' : '#94a3b8',
                              fontWeight: isActive ? 600 : 500,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1e293b'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 16, display: 'flex', color: isActive ? '#ffffff' : '#94a3b8' }}>{item.icon}</span>
                              {!collapsed && <span>{item.label}</span>}
                            </div>
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Section: CONFIGURATION */}
                <div>
                  {!collapsed && (
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '4px 10px',
                      marginBottom: 4
                    }}>
                      System
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      { key: 'settings', icon: <SettingOutlined />, label: 'Store & COD Policy', badge: null }
                    ].filter(item => !sidebarSearch || item.label.toLowerCase().includes(sidebarSearch.toLowerCase())).map(item => {
                      const isActive = activeTab === item.key;
                      return (
                        <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                          <button
                            onClick={() => setActiveTab(item.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: collapsed ? 'center' : 'space-between',
                              width: '100%',
                              padding: collapsed ? '10px 0' : '9px 12px',
                              borderRadius: 10,
                              border: 'none',
                              background: isActive ? '#2563eb' : 'transparent',
                              color: isActive ? '#ffffff' : '#94a3b8',
                              fontWeight: isActive ? 600 : 500,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1e293b'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 16, display: 'flex', color: isActive ? '#ffffff' : '#94a3b8' }}>{item.icon}</span>
                              {!collapsed && <span>{item.label}</span>}
                            </div>
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: User Profile & Collapse Toggle */}
            <div style={{
              padding: '12px 10px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <Dropdown menu={{ items: userMenuItems }} placement="topRight" trigger={['click']}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  cursor: 'pointer'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar
                      style={{ backgroundColor: '#2563eb', color: '#fff', fontWeight: 700 }}
                      size={28}
                    >
                      {user.fullName ? user.fullName[0].toUpperCase() : 'U'}
                    </Avatar>
                    {!collapsed && (
                      <div style={{ lineHeight: 1.2, textAlign: 'left', overflow: 'hidden' }}>
                        <div style={{ color: '#f8fafc', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.fullName}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                          {user.role}
                        </div>
                      </div>
                    )}
                  </div>
                  {!collapsed && <LogoutOutlined style={{ color: '#64748b', fontSize: 12 }} />}
                </div>
              </Dropdown>

              <button
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 8,
                  padding: '7px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 6
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
              >
                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                {!collapsed && <span>Collapse Sidebar</span>}
              </button>
            </div>
          </div>
        </Sider>

        {/* Main Content Layout with Top Header */}
        <Layout style={{ background: '#090d16' }}>
          <Header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: '#090d16',
            borderBottom: '1px solid #1e293b',
            position: 'sticky',
            top: 0,
            zIndex: 90,
            height: 60,
            lineHeight: 'normal'
          }}>
            {/* Breadcrumb Left */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>Shopify</span>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#f8fafc', fontSize: 14, fontWeight: 700 }}>
                {activeTab === 'drafts' && 'Draft Orders'}
                {activeTab === 'bulk' && 'Bulk Order Staging Queue'}
                {activeTab === 'history' && 'Bulk Jobs History'}
                {activeTab === 'audit' && 'Operational Audit Trail'}
                {activeTab === 'settings' && 'Store & COD Policy Settings'}
              </span>
            </div>

            {/* Header Right: Store Status Chip & Refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                color: '#94a3b8',
                background: '#0f172a',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{config?.store_domain || 'upcraft-cod-demo.myshopify.com'}</span>
                <span style={{ color: '#475569' }}>•</span>
                {config?.mock_mode ? (
                  <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    Mock Simulator
                  </span>
                ) : (
                  <span style={{ color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
                    Live Store API
                  </span>
                )}
              </div>

              <Button
                size="small"
                icon={<SyncOutlined spin={loadingDrafts} />}
                onClick={() => {
                  if (activeTab === 'drafts') fetchDrafts();
                  else if (activeTab === 'history') fetchJobsHistory();
                  else if (activeTab === 'audit') fetchAuditLogs();
                  else if (activeTab === 'settings') fetchConfig();
                }}
                style={{ background: '#0f172a', borderColor: '#1e293b', color: '#94a3b8' }}
              >
                Refresh
              </Button>
            </div>
          </Header>

        {/* Content Area */}
        <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%', paddingBottom: 110 }}>
          {/* TAB 1: DRAFT ORDERS */}
          {activeTab === 'drafts' && (
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {/* Top Statistics Cards */}
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Total Open Drafts</Text>
                      <ShoppingOutlined style={{ color: '#38bdf8', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
                      {unstagedDrafts.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                      {bulkQueue.length > 0 ? `${bulkQueue.length} moved to Bulk Orders` : 'Fetched via GraphQL API'}
                    </Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Verified COD Ready</Text>
                      <CheckCircleOutlined style={{ color: '#10b981', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981', lineHeight: 1.1 }}>
                      {unstagedDrafts.filter(d => d.isCodEligible).length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Tagged with "{config?.cod_marker_value || 'COD'}"</Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Flagged Anomalies</Text>
                      <WarningOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', lineHeight: 1.1 }}>
                      {unstagedDrafts.filter(d => d.flags && d.flags.length > 0).length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Missing phone or high value</Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(15, 23, 42, 0.95))', borderColor: 'rgba(37, 99, 235, 0.35)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>Selected for Bulk</Text>
                      <Tag color="blue" style={{ margin: 0, fontWeight: 700, borderRadius: 4 }}>{selectedMap.size} / 70</Tag>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1, fontFamily: 'monospace' }}>
                      ₹{selectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>Retained across pagination</Text>
                  </Card>
                </Col>
              </Row>

              {/* Filters & Search Toolbar */}
              <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }} bodyStyle={{ padding: 14 }}>
                <Row gutter={[16, 12]} align="middle" justify="space-between">
                  <Col xs={24} md={8}>
                    <Input
                      placeholder="Search draft #, customer, phone, email, or tag..."
                      prefix={<SearchOutlined style={{ color: '#64748b' }} />}
                      allowClear
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ borderRadius: 6, background: '#090d16', borderColor: '#1e293b' }}
                    />
                  </Col>

                  <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                    <Segmented
                      value={activeFilter}
                      onChange={setActiveFilter}
                      options={[
                        { label: `All (${unstagedDrafts.length})`, value: 'ALL' },
                        { label: `COD Ready (${unstagedDrafts.filter(d => d.isCodEligible).length})`, value: 'COD_ONLY' },
                        { label: `Non-COD (${unstagedDrafts.filter(d => !d.isCodEligible).length})`, value: 'NON_COD' },
                        { label: `Flagged (${unstagedDrafts.filter(d => d.flags?.length > 0).length})`, value: 'FLAGGED' }
                      ]}
                      style={{ background: '#090d16', padding: 3 }}
                    />

                    <Button icon={<CheckOutlined />} onClick={selectAllOnPage} style={{ borderRadius: 6 }}>
                      Select Page
                    </Button>

                    {selectedMap.size > 0 && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={addSelectedToBulk}
                        style={{ borderRadius: 6, background: '#2563eb', borderColor: '#2563eb' }}
                      >
                        Add to Bulk ({selectedMap.size})
                      </Button>
                    )}

                    {selectedMap.size > 0 && (
                      <Button danger onClick={clearSelection} style={{ borderRadius: 6 }}>
                        Clear ({selectedMap.size})
                      </Button>
                    )}

                    <Button icon={<SyncOutlined spin={loadingDrafts} />} onClick={() => fetchDrafts()} style={{ borderRadius: 6 }}>
                      Refresh
                    </Button>
                  </Col>
                </Row>
              </Card>

              {/* Ant Design Data Table */}
              <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b', overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
                <Table
                  rowKey="id"
                  loading={loadingDrafts}
                  columns={draftColumns}
                  dataSource={filteredDrafts}
                  expandable={{ expandedRowRender }}
                  locale={{
                    emptyText: drafts.length > 0 && bulkQueue.length > 0 ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                        <CheckCircleOutlined style={{ fontSize: 36, color: '#10b981', marginBottom: 12 }} />
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                          All Open Drafts Moved to Bulk Orders
                        </div>
                        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 460, margin: '0 auto 18px' }}>
                          All {drafts.length} open draft orders have been moved to the Bulk Orders page ({bulkQueue.length} staged).
                        </div>
                        <Button
                          type="primary"
                          icon={<ThunderboltOutlined />}
                          onClick={() => setActiveTab('bulk')}
                          style={{ background: '#2563eb', borderColor: '#2563eb', borderRadius: 6, fontWeight: 600, height: 36, padding: '0 18px' }}
                        >
                          Go to Bulk Orders Page ({bulkQueue.length})
                        </Button>
                      </div>
                    ) : (
                      <Empty description={<span style={{ color: '#64748b' }}>No open draft orders found</span>} />
                    )
                  }}
                  rowSelection={{
                    selectedRowKeys: Array.from(selectedMap.keys()),
                    onChange: onSelectChange,
                    preserveSelectedRowKeys: true,
                    getCheckboxProps: (record) => ({
                      disabled: !record.isCodEligible,
                      name: record.name,
                    })
                  }}
                  pagination={{
                    pageSize: pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['25', '50', '75'],
                    onShowSizeChange: (_, size) => setPageSize(size),
                    showTotal: total => `Total ${total} open drafts`
                  }}
                  scroll={{ x: 1140 }}
                />
              </Card>
            </Space>
          )}

          {/* TAB: BULK ORDERS STAGING QUEUE */}
          {activeTab === 'bulk' && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* Stat Cards */}
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Staged in Bulk Queue</Text>
                      <ThunderboltOutlined style={{ color: '#38bdf8', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
                      {bulkQueue.length} <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>/ {config?.max_batch_size || 70} cap</span>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Saved across browser sessions</Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Ready to Convert</Text>
                      <CheckCircleOutlined style={{ color: '#10b981', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981', lineHeight: 1.1 }}>
                      {bulkReadyDrafts.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>100% address & COD verified</Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>Needs Attention</Text>
                      <WarningOutlined style={{ color: bulkBrokenDrafts.length > 0 ? '#f59e0b' : '#64748b', fontSize: 16 }} />
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: bulkBrokenDrafts.length > 0 ? '#f59e0b' : '#94a3b8', lineHeight: 1.1 }}>
                      {bulkBrokenDrafts.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Missing phone, address, or tag</Text>
                  </Card>
                </Col>

                <Col xs={24} sm={12} md={6}>
                  <Card bordered style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.95))', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>Ready Batch Value</Text>
                      <Tag color="green" style={{ margin: 0, fontWeight: 700, borderRadius: 4 }}>{bulkReadyDrafts.length} Orders</Tag>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1, fontFamily: 'monospace' }}>
                      ₹{bulkReadyTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>Eligible for batch confirmation</Text>
                  </Card>
                </Col>
              </Row>

              {/* Warning Notice if Broken Drafts Exist */}
              {bulkBrokenDrafts.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message={`${bulkBrokenDrafts.length} draft order(s) require address or tag fix before conversion`}
                  description={
                    <div style={{ fontSize: 12 }}>
                      Click the <strong style={{ color: '#fdba74' }}>Fix</strong> button on any incomplete draft below to provide missing details (phone, city, state, or pincode). Updates sync directly to Shopify and immediately mark the draft as Ready to Convert.
                    </div>
                  }
                  style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                />
              )}

              {/* Toolbar */}
              <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b' }} bodyStyle={{ padding: 14 }}>
                <Row gutter={[16, 12]} align="middle" justify="space-between">
                  <Col xs={24} md={12}>
                    <Segmented
                      value={bulkFilter}
                      onChange={setBulkFilter}
                      options={[
                        { label: `All Staged (${bulkQueue.length})`, value: 'ALL' },
                        { label: `Ready to Convert (${bulkReadyDrafts.length})`, value: 'READY' },
                        { label: `Needs Attention (${bulkBrokenDrafts.length})`, value: 'NEEDS_FIX' }
                      ]}
                      style={{ background: '#090d16', padding: 3 }}
                    />
                  </Col>

                  <Col xs={24} md={12} style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                    {bulkQueue.length > 0 && (
                      <Button danger icon={<DeleteOutlined />} onClick={clearBulkQueue} style={{ borderRadius: 6 }}>
                        Clear Queue
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      disabled={bulkReadyDrafts.length === 0}
                      onClick={() => {
                        setReviewDrafts(bulkReadyDrafts);
                        setShowReviewModal(true);
                        setConfirmPhrase('');
                      }}
                      style={{
                        borderRadius: 6,
                        fontWeight: 700,
                        background: bulkReadyDrafts.length > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
                        borderColor: bulkReadyDrafts.length > 0 ? '#10b981' : undefined
                      }}
                    >
                      Convert Ready Orders ({bulkReadyDrafts.length})
                    </Button>
                  </Col>
                </Row>
              </Card>

              {/* Data Table or Empty Queue State */}
              <Card bordered style={{ background: '#0f172a', borderColor: '#1e293b', overflow: 'hidden' }} bodyStyle={{ padding: bulkQueue.length === 0 ? 40 : 0 }}>
                {bulkQueue.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#f8fafc', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                          No Drafts in Bulk Order Queue
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 460, margin: '0 auto 16px' }}>
                          Switch to the <strong>Draft Orders</strong> tab and click <strong>+ Bulk</strong> on any draft order to stage it here. You can inspect delivery completeness, fix missing fields in-place, and run bulk batch confirmation safely.
                        </div>
                        <Button type="primary" onClick={() => setActiveTab('drafts')}>
                          Go to Draft Orders
                        </Button>
                      </div>
                    }
                  />
                ) : (
                  <Table
                    rowKey="id"
                    columns={bulkColumns}
                    dataSource={filteredBulkDrafts}
                    expandable={{ expandedRowRender }}
                    pagination={{
                      pageSize: 25,
                      showTotal: total => `Total ${total} staged drafts`
                    }}
                    scroll={{ x: 1140 }}
                  />
                )}
              </Card>
            </Space>
          )}

          {/* TAB 2: BULK JOBS HISTORY */}
          {activeTab === 'history' && (
            <Card
              title={<span style={{ fontWeight: 700, fontSize: 16 }}>Bulk Confirmation Jobs History</span>}
              extra={<Button icon={<SyncOutlined spin={loadingHistory} />} onClick={fetchJobsHistory}>Refresh</Button>}
              style={{ background: '#0f172a', borderColor: '#1e293b' }}
              bodyStyle={{ padding: 0 }}
            >
              <Table
                rowKey="id"
                loading={loadingHistory}
                dataSource={jobsHistory}
                columns={[
                  {
                    title: 'Job ID',
                    dataIndex: 'id',
                    render: text => <Text code copyable style={{ color: '#38bdf8' }}>{text.slice(0, 8)}...</Text>
                  },
                  { title: 'Operator', dataIndex: 'created_by' },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: status => {
                      const colors = {
                        COMPLETED: 'success',
                        RUNNING: 'processing',
                        PARTIALLY_FAILED: 'warning',
                        FAILED: 'error',
                        CANCELLED: 'default'
                      };
                      return <Tag color={colors[status] || 'default'} style={{ fontWeight: 600 }}>{status}</Tag>;
                    }
                  },
                  { title: 'Requested', dataIndex: 'requested_count', align: 'center', render: c => <strong>{c}</strong> },
                  {
                    title: 'Succeeded',
                    dataIndex: 'success_count',
                    align: 'center',
                    render: c => <span style={{ color: '#10b981', fontWeight: 700 }}>{c}</span>
                  },
                  {
                    title: 'Failed',
                    dataIndex: 'failed_count',
                    align: 'center',
                    render: c => <span style={{ color: '#ef4444', fontWeight: 700 }}>{c}</span>
                  },
                  {
                    title: 'Unknown',
                    dataIndex: 'unknown_count',
                    align: 'center',
                    render: c => <span style={{ color: '#f59e0b', fontWeight: 700 }}>{c}</span>
                  },
                  {
                    title: 'Date & Time',
                    dataIndex: 'created_at',
                    render: d => new Date(d).toLocaleString()
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    render: (_, record) => (
                      <Space>
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={async () => {
                            const res = await authFetch(`${API_BASE}/bulk-jobs/${record.id}`);
                            const data = await res.json();
                            if (data.success) {
                              setActiveJob(data.data);
                              setShowJobModal(true);
                            }
                          }}
                        >
                          Inspect
                        </Button>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          href={`${API_BASE}/bulk-jobs/${record.id}/export?token=${token}`}
                        >
                          CSV
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <Card
              title={<span style={{ fontWeight: 700, fontSize: 16 }}>Security & Operations Audit Trail</span>}
              extra={<Button icon={<SyncOutlined spin={loadingAudit} />} onClick={fetchAuditLogs}>Refresh</Button>}
              style={{ background: '#0f172a', borderColor: '#1e293b' }}
              bodyStyle={{ padding: 0 }}
            >
              <Table
                rowKey="id"
                loading={loadingAudit}
                dataSource={auditLogs}
                columns={[
                  {
                    title: 'Timestamp',
                    dataIndex: 'created_at',
                    render: d => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{new Date(d).toLocaleString()}</span>
                  },
                  {
                    title: 'Actor',
                    dataIndex: 'actor',
                    render: actor => <Tag color="blue" style={{ fontWeight: 600 }}>{actor}</Tag>
                  },
                  {
                    title: 'Action',
                    dataIndex: 'action',
                    render: action => <span style={{ color: '#38bdf8', fontWeight: 600 }}>{action}</span>
                  },
                  {
                    title: 'Target',
                    key: 'target',
                    render: (_, r) => `${r.target_type} (${r.target_id ? r.target_id.slice(0, 8) : 'N/A'})`
                  },
                  {
                    title: 'IP Address',
                    dataIndex: 'ip_address',
                    render: ip => <span style={{ color: '#64748b' }}>{ip || '127.0.0.1'}</span>
                  }
                ]}
              />
            </Card>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && config && (
            <Card title={<span style={{ fontWeight: 700, fontSize: 16 }}>Shopify Admin API & COD Safety Rules</span>} style={{ maxWidth: 840, background: '#0f172a', borderColor: '#1e293b' }}>
              {configFeedback && (
                <Alert
                  message={configFeedback.message}
                  type={configFeedback.success ? 'success' : 'error'}
                  showIcon
                  style={{ marginBottom: 20 }}
                />
              )}

              <Form layout="vertical">
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Store Domain">
                      <Input
                        value={config.store_domain}
                        onChange={e => setConfig({ ...config, store_domain: e.target.value })}
                        placeholder="your-store.myshopify.com"
                      />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item label="API Version (Pinned)">
                      <Input value={config.api_version} disabled style={{ fontFamily: 'monospace' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label="Admin Access Token (Direct)">
                  <Input.Password
                    placeholder={config.has_token ? '•••••••••••••••••••••••• (Configured)' : 'shpat_...'}
                    onChange={e => setConfig({ ...config, access_token: e.target.value })}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>Paste direct access token if available, OR use Partner App Client ID & Secret below.</Text>
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Shopify App Client ID">
                      <Input
                        value={config.client_id || ''}
                        onChange={e => setConfig({ ...config, client_id: e.target.value })}
                        placeholder="e.g. 2335c041e96357e5a313cfdd0dbe2983"
                        style={{ fontFamily: 'monospace' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Shopify App Client Secret">
                      <Input.Password
                        value={config.client_secret || ''}
                        onChange={e => setConfig({ ...config, client_secret: e.target.value })}
                        placeholder="Paste Client secret"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider style={{ borderColor: '#1e293b' }} />

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="COD Marker Tag">
                      <Input
                        value={config.cod_marker_value}
                        onChange={e => setConfig({ ...config, cod_marker_value: e.target.value })}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item label="Max Batch Limit">
                      <InputNumber
                        min={1}
                        max={70}
                        value={config.max_batch_size}
                        onChange={v => setConfig({ ...config, max_batch_size: v })}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Throttling Rate Limit Delay (ms)">
                      <InputNumber
                        min={100}
                        max={2000}
                        step={50}
                        value={config.rate_limit_delay_ms}
                        onChange={v => setConfig({ ...config, rate_limit_delay_ms: v })}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>

                  <Col span={12}>
                    <Form.Item label="Mock Simulator Mode">
                      <div style={{ marginTop: 6 }}>
                        <Switch
                          checked={config.mock_mode}
                          onChange={c => setConfig({ ...config, mock_mode: c })}
                        />
                        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                          {config.mock_mode ? 'Enabled (Zero-risk virtual store)' : 'Disabled (Live Store Admin API)'}
                        </Text>
                      </div>
                    </Form.Item>
                  </Col>
                </Row>

                <Space style={{ marginTop: 16 }}>
                  <Button
                    type="primary"
                    onClick={async () => {
                      try {
                        const res = await authFetch(`${API_BASE}/config`, {
                          method: 'PUT',
                          body: JSON.stringify(config)
                        });
                        const json = await res.json();
                        if (json.success) {
                          message.success('Store configuration updated!');
                          setConfigFeedback({ success: true, message: 'Settings saved successfully!' });
                        }
                      } catch (e) {
                        message.error(e.message);
                      }
                    }}
                  >
                    Save Changes
                  </Button>

                  <Button
                    loading={testingConnection}
                    onClick={async () => {
                      setTestingConnection(true);
                      try {
                        const res = await authFetch(`${API_BASE}/config/test-connection`, { method: 'POST' });
                        const json = await res.json();
                        setConfigFeedback(json);
                        if (json.success) {
                          message.success(json.message);
                        } else {
                          message.error(json.message);
                        }
                      } catch (e) {
                        message.error(e.message);
                      } finally {
                        setTestingConnection(false);
                      }
                    }}
                  >
                    Test Shopify Connection
                  </Button>

                  {config.client_id && (
                    <Button
                      style={{ background: '#059669', borderColor: '#059669', color: '#fff' }}
                      onClick={() => {
                        window.location.href = `/api/shopify/install?shop=${encodeURIComponent(config.store_domain)}`;
                      }}
                    >
                      Authorize via Shopify App (1-Click)
                    </Button>
                  )}
                </Space>
              </Form>
            </Card>
          )}
        </Content>

        {/* Ant Design Floating Selection Bar (Affix) */}
        {selectedMap.size > 0 && activeTab === 'drafts' && (
          <div style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #2563eb',
            boxShadow: '0 20px 35px -5px rgba(0,0,0,0.7), 0 0 20px rgba(37, 99, 235, 0.4)',
            borderRadius: 9999,
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            zIndex: 1000
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
                fontSize: 13
              }}>
                {selectedMap.size}
              </div>
              <div>
                <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>
                  {selectedMap.size} of 70 drafts selected
                </div>
                <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>
                  Total: ₹{selectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <Space size={8}>
              <Button size="middle" onClick={clearSelection} style={{ borderRadius: 9999 }}>
                Clear
              </Button>
              <Button
                type="default"
                size="middle"
                icon={<PlusOutlined />}
                onClick={addSelectedToBulk}
                style={{ borderRadius: 9999, borderColor: '#3b82f6', color: '#60a5fa' }}
              >
                + Add to Bulk ({selectedMap.size})
              </Button>
              <Button
                type="primary"
                size="middle"
                icon={<ArrowRightOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  borderColor: '#10b981',
                  fontWeight: 700,
                  borderRadius: 9999,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                }}
                onClick={() => {
                  setReviewDrafts(Array.from(selectedMap.values()));
                  setShowReviewModal(true);
                  setConfirmPhrase('');
                }}
              >
                Review & Confirm ({selectedMap.size})
              </Button>
            </Space>
          </div>
        )}

        {/* Review & Safety Confirmation Modal */}
        {(() => {
          const targetReviewList = reviewDrafts.length > 0 ? reviewDrafts : Array.from(selectedMap.values());
          return (
            <Modal
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#f59e0b' }} />
                  <span style={{ fontWeight: 700 }}>Review Bulk COD Confirmation</span>
                </Space>
              }
              open={showReviewModal}
              width={680}
              onCancel={() => {
                setShowReviewModal(false);
                setReviewDrafts([]);
              }}
              footer={[
                <Button key="cancel" onClick={() => { setShowReviewModal(false); setReviewDrafts([]); }}>Cancel</Button>,
                <Button
                  key="execute"
                  type="primary"
                  danger
                  icon={<ThunderboltOutlined />}
                  disabled={confirmPhrase.trim() !== `CONFIRM ${targetReviewList.length} ORDERS`}
                  onClick={handleCreateAndStartJob}
                  style={{ fontWeight: 700 }}
                >
                  Execute Bulk Confirmation ({targetReviewList.length})
                </Button>
              ]}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Alert
                  type="warning"
                  showIcon
                  message="Operational Safety Gate"
                  description={
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}>
                        Converting {targetReviewList.length} draft orders executes Shopify's <Text code>draftOrderComplete</Text> mutation.
                        This <strong>commits store inventory</strong> and creates regular orders.
                      </div>
                      <Text strong style={{ color: '#f8fafc' }}>
                        Orders remain UNPAID / PAYMENT DUE until cash is physically received.
                      </Text>
                    </div>
                  }
                />

                <Table
                  size="small"
                  rowKey="id"
                  dataSource={targetReviewList}
                  pagination={{ pageSize: 5 }}
                  columns={[
                    { title: 'Draft #', dataIndex: 'name', render: t => <Text strong code style={{ color: '#38bdf8' }}>{t}</Text> },
                    { title: 'Customer', render: (_, r) => `${r.customer?.firstName || ''} ${r.customer?.lastName || ''}` },
                    {
                      title: 'Amount',
                      align: 'right',
                      render: (_, r) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#34d399' }}>₹{parseFloat(r.totalPriceSet?.shopMoney?.amount || 0).toFixed(2)}</span>
                    }
                  ]}
                />

                <Card style={{ background: '#090d16', borderColor: '#1e293b' }} size="small">
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Text strong style={{ fontSize: 12 }}>
                      Accidental Submit Prevention: Type <Text code style={{ color: '#f59e0b', fontWeight: 700 }}>CONFIRM {targetReviewList.length} ORDERS</Text> to unlock:
                    </Text>
                    <Input
                      placeholder={`CONFIRM ${targetReviewList.length} ORDERS`}
                      value={confirmPhrase}
                      onChange={e => setConfirmPhrase(e.target.value)}
                      style={{ fontFamily: 'monospace', fontWeight: 600 }}
                      size="large"
                    />
                  </Space>
                </Card>
              </Space>
            </Modal>
          );
        })()}

        {/* Live Job Progress Modal */}
        <Modal
          title={
            activeJob ? (
              <Space>
                <ThunderboltOutlined style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 700 }}>Bulk Job #{activeJob.id.slice(0, 8)} Execution Monitor</span>
                <Tag color={activeJob.status === 'RUNNING' ? 'processing' : 'success'} style={{ fontWeight: 600 }}>{activeJob.status}</Tag>
              </Space>
            ) : 'Job Progress'
          }
          open={showJobModal}
          width={720}
          onCancel={() => setShowJobModal(false)}
          footer={[
            activeJob?.status === 'RUNNING' && (
              <Button key="cancel" danger onClick={handleCancelJob}>Cancel Remaining Drafts</Button>
            ),
            <Button
              key="export"
              icon={<DownloadOutlined />}
              href={`${API_BASE}/bulk-jobs/${activeJob?.id}/export?token=${token}`}
            >
              Export CSV Report
            </Button>,
            <Button key="dismiss" type="primary" onClick={() => setShowJobModal(false)}>Close View</Button>
          ]}
        >
          {activeJob && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <Text type="secondary">Batch Progress</Text>
                  <Text strong>
                    {activeJob.success_count + activeJob.failed_count + activeJob.unknown_count} of {activeJob.requested_count} processed
                  </Text>
                </div>
                <Progress
                  percent={Math.round(((activeJob.success_count + activeJob.failed_count + activeJob.unknown_count) / activeJob.requested_count) * 100)}
                  status={activeJob.status === 'RUNNING' ? 'active' : 'normal'}
                  strokeColor={{ '0%': '#2563eb', '100%': '#10b981' }}
                />
              </div>

              <Row gutter={12}>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', background: '#0b1329', borderColor: '#1e293b' }}>
                    <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Total</Text>} value={activeJob.requested_count} valueStyle={{ fontSize: 18, fontWeight: 700 }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <Statistic title={<Text style={{ color: '#10b981', fontSize: 11 }}>Succeeded</Text>} value={activeJob.success_count} valueStyle={{ color: '#10b981', fontSize: 18, fontWeight: 700 }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <Statistic title={<Text style={{ color: '#ef4444', fontSize: 11 }}>Failed</Text>} value={activeJob.failed_count} valueStyle={{ color: '#ef4444', fontSize: 18, fontWeight: 700 }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <Statistic title={<Text style={{ color: '#f59e0b', fontSize: 11 }}>Unknown</Text>} value={activeJob.unknown_count} valueStyle={{ color: '#f59e0b', fontSize: 18, fontWeight: 700 }} />
                  </Card>
                </Col>
              </Row>

              <Card
                size="small"
                title="Live Mutation Log Stream"
                style={{ background: '#090d16', borderColor: '#1e293b', maxHeight: 260, overflowY: 'auto' }}
              >
                <List
                  size="small"
                  dataSource={activeJob.items || []}
                  renderItem={item => (
                    <List.Item
                      actions={[
                        item.status === 'SUCCEEDED' ? (
                          <Tag color="success" style={{ fontWeight: 600 }}>Created {item.shopify_order_name}</Tag>
                        ) : item.status === 'PROCESSING' ? (
                          <Tag color="processing">Processing...</Tag>
                        ) : item.status === 'UNKNOWN' ? (
                          <Space>
                            <Tag color="warning">UNKNOWN</Tag>
                            <Button size="small" type="link" onClick={() => handleReconcileItem(item.id)}>
                              Reconcile
                            </Button>
                          </Space>
                        ) : item.status === 'FAILED' ? (
                          <Tag color="error">{item.error_code || 'Failed'}</Tag>
                        ) : (
                          <Tag color="default">Pending</Tag>
                        )
                      ]}
                    >
                      <Space>
                        <Text code style={{ color: '#38bdf8' }}>{item.draft_order_name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{item.customer_name}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Space>
          )}
        </Modal>

        {/* Single Test Modal */}
        <Modal
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#10b981' }} />
              <span style={{ fontWeight: 700 }}>Single Draft Test Successful</span>
            </Space>
          }
          open={!!singleTestModal}
          onOk={() => setSingleTestModal(null)}
          onCancel={() => setSingleTestModal(null)}
        >
          {singleTestModal && (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Paragraph style={{ margin: 0, fontSize: 13, color: '#cbd5e1' }}>
                Single draft order completed successfully. Verified financial and gateway parameters:
              </Paragraph>
              <Card size="small" style={{ background: '#0b1329', borderColor: '#1e293b' }}>
                <Row gutter={[12, 10]}>
                  <Col span={12}><Text type="secondary">Created Order Name:</Text></Col>
                  <Col span={12}><Text strong style={{ color: '#10b981', fontSize: 14 }}>{singleTestModal.order?.name}</Text></Col>

                  <Col span={12}><Text type="secondary">Financial Status:</Text></Col>
                  <Col span={12}><Tag color="warning" style={{ fontWeight: 600 }}>{singleTestModal.order?.displayFinancialStatus}</Tag></Col>

                  <Col span={12}><Text type="secondary">Payment Gateway:</Text></Col>
                  <Col span={12}><Text strong style={{ color: '#f8fafc' }}>{singleTestModal.order?.paymentGatewayNames?.join(', ')}</Text></Col>
                </Row>
              </Card>
              <Alert
                type="success"
                showIcon
                message="Confirmed: COD Gateway and UNPAID financial status validated. Safe for bulk execution."
              />
            </Space>
          )}
        </Modal>

        {/* Full Draft Details Modal */}
        <Modal
          title={
            viewDraftModal && (
              <Space>
                <FileTextOutlined style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 700 }}>Draft Order {viewDraftModal.name} — Full Details</span>
                {viewDraftModal.isCodEligible ? (
                  <Tag color="success">COD Ready</Tag>
                ) : !viewDraftModal.isAddressComplete ? (
                  <Tag color="error">Incomplete Delivery Address</Tag>
                ) : (
                  <Tag color="warning">Non-COD</Tag>
                )}
              </Space>
            )
          }
          open={!!viewDraftModal}
          onCancel={() => setViewDraftModal(null)}
          width={760}
          centered
          styles={{
            body: {
              maxHeight: 'calc(85vh - 120px)',
              overflowY: 'auto'
            }
          }}
          footer={[
            <Button key="close" onClick={() => setViewDraftModal(null)}>
              Close
            </Button>,
            viewDraftModal && (
              <Button
                key="edit"
                type="primary"
                icon={<EditOutlined />}
                onClick={() => openEditModal(viewDraftModal)}
              >
                Edit / Fix Address
              </Button>
            )
          ]}
        >
          {viewDraftModal && (() => {
            const ship = viewDraftModal.shippingAddress || {};
            const cust = viewDraftModal.customer || {};
            const phone = viewDraftModal.phone || cust.phone || ship.phone;
            const items = viewDraftModal.lineItems?.nodes || [];
            const subtotal = viewDraftModal.subtotalPriceSet?.shopMoney?.amount || viewDraftModal.totalPriceSet?.shopMoney?.amount || '0';
            const total = viewDraftModal.totalPriceSet?.shopMoney?.amount || '0';

            return (
              <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
                {/* 1. Readiness Checklist Card */}
                <Card
                  size="small"
                  title={<span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Delivery Readiness & Validation Checklist</span>}
                  style={{ background: '#0b1329', borderColor: '#1e293b' }}
                >
                  <Row gutter={[10, 10]}>
                    <Col span={8}>
                      {phone ? <Tag color="success">✓ Phone: {phone}</Tag> : <Tag color="error">✗ Missing Phone</Tag>}
                    </Col>
                    <Col span={8}>
                      {ship.address1 ? <Tag color="success">✓ Address Line 1</Tag> : <Tag color="error">✗ Missing Address 1</Tag>}
                    </Col>
                    <Col span={8}>
                      {ship.city ? <Tag color="success">✓ City: {ship.city}</Tag> : <Tag color="error">✗ Missing City</Tag>}
                    </Col>
                    <Col span={8}>
                      {ship.province ? <Tag color="success">✓ State: {ship.province}</Tag> : <Tag color="error">✗ Missing State</Tag>}
                    </Col>
                    <Col span={8}>
                      {ship.zip ? <Tag color="success">✓ Pincode: {ship.zip}</Tag> : <Tag color="error">✗ Missing Pincode</Tag>}
                    </Col>
                    <Col span={8}>
                      {viewDraftModal.tags?.includes(config?.cod_marker_value || 'COD') ? (
                        <Tag color="success">✓ COD Tag Present</Tag>
                      ) : (
                        <Tag color="warning">✗ Missing COD Tag</Tag>
                      )}
                    </Col>
                  </Row>

                  {!viewDraftModal.isAddressComplete && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginTop: 12 }}
                      message={`Cannot convert into order: missing ${viewDraftModal.missingFields?.filter(f => f !== 'COD Tag').join(', ')}. Use 'Edit / Fix Address' to complete details.`}
                    />
                  )}
                </Card>

                {/* 2. Customer & Shipping Address Card */}
                <Card
                  size="small"
                  title={<span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Customer & Shipping Details</span>}
                  style={{ background: '#0b1329', borderColor: '#1e293b' }}
                  extra={
                    <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditModal(viewDraftModal)}>
                      Edit Address
                    </Button>
                  }
                >
                  <Row gutter={[16, 12]}>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Recipient Name:</Text>
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>
                        {ship.name || `${cust.firstName || ''} ${cust.lastName || ''}`.trim() || 'Guest Customer'}
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Contact Phone:</Text>
                      <div style={{ fontWeight: 600, color: phone ? '#38bdf8' : '#ef4444', fontSize: 13 }}>
                        {phone || 'Not Provided (Required)'}
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Email Address:</Text>
                      <div style={{ color: '#cbd5e1', fontSize: 13 }}>{viewDraftModal.email || cust.email || 'None'}</div>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Delivery Location:</Text>
                      <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                        {ship.city ? `${ship.city}, ` : ''}{ship.province || ''}{ship.zip ? ` - ${ship.zip}` : ''}{ship.country ? `, ${ship.country}` : ''}
                      </div>
                    </Col>
                    <Col span={24}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Street Address:</Text>
                      <div style={{ color: '#f8fafc', fontSize: 13, marginTop: 2, background: '#070b14', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
                        {ship.address1 || 'None'}{ship.address2 ? `, ${ship.address2}` : ''}
                      </div>
                    </Col>
                  </Row>
                </Card>

                {/* 3. Line Items Table */}
                <Card
                  size="small"
                  title={<span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Line Items ({items.length})</span>}
                  style={{ background: '#0b1329', borderColor: '#1e293b' }}
                >
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={items}
                    rowKey="id"
                    columns={[
                      {
                        title: 'Product Title',
                        dataIndex: 'title',
                        key: 'title',
                        render: (t, r) => (
                          <div>
                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{t || r.name}</span>
                            {r.sku && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>(SKU: {r.sku})</Text>}
                            {r.variantTitle && <div style={{ fontSize: 11, color: '#64748b' }}>Variant: {r.variantTitle}</div>}
                          </div>
                        )
                      },
                      {
                        title: 'Unit Price',
                        dataIndex: ['originalUnitPriceSet', 'shopMoney', 'amount'],
                        key: 'price',
                        align: 'right',
                        width: 100,
                        render: val => `₹${parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      },
                      {
                        title: 'Qty',
                        dataIndex: 'quantity',
                        key: 'qty',
                        align: 'center',
                        width: 60
                      },
                      {
                        title: 'Total',
                        key: 'lineTotal',
                        align: 'right',
                        width: 110,
                        render: (_, r) => {
                          const unit = parseFloat(r.originalUnitPriceSet?.shopMoney?.amount || 0);
                          const lineTot = unit * (r.quantity || 1);
                          return (
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#34d399' }}>
                              ₹{lineTot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          );
                        }
                      }
                    ]}
                  />
                  <Divider style={{ margin: '12px 0', borderColor: '#1e293b' }} />
                  <Row justify="end">
                    <Col span={10}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                        <Text type="secondary">Subtotal:</Text>
                        <Text>₹{parseFloat(subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                        <Text type="secondary">Estimated Tax:</Text>
                        <Text>₹{parseFloat(viewDraftModal.totalTaxSet?.shopMoney?.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#34d399' }}>
                        <span>Total Due (COD):</span>
                        <span>₹{parseFloat(total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </Col>
                  </Row>
                </Card>

                {/* 4. Notes & Tags */}
                <Card
                  size="small"
                  title={<span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Order Tags & Notes</span>}
                  style={{ background: '#0b1329', borderColor: '#1e293b' }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Tags:</Text>
                    {viewDraftModal.tags?.length > 0 ? (
                      viewDraftModal.tags.map(t => <Tag key={t} color="blue">{t}</Tag>)
                    ) : (
                      <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 12 }}>No tags assigned</Text>
                    )}
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Order Note:</Text>
                    <Text style={{ fontSize: 12, color: viewDraftModal.note ? '#f8fafc' : '#64748b' }}>
                      {viewDraftModal.note || 'None'}
                    </Text>
                  </div>
                </Card>
              </Space>
            );
          })()}
        </Modal>

        {/* Edit / Fix Missing Details Modal - Fully responsive, centered, screen-fitted */}
        <Modal
          title={
            editDraftModal && (
              <Space>
                <EditOutlined style={{ color: '#f59e0b' }} />
                <span style={{ fontWeight: 700 }}>Edit Delivery & Contact Details — {editDraftModal.name}</span>
              </Space>
            )
          }
          open={!!editDraftModal}
          onCancel={() => setEditDraftModal(null)}
          width={760}
          centered
          styles={{
            body: {
              maxHeight: 'calc(85vh - 110px)',
              overflowY: 'auto',
              padding: '12px 18px'
            }
          }}
          confirmLoading={savingDraft}
          okText="Save & Sync to Shopify"
          onOk={handleSaveDraft}
        >
          {editDraftModal && (
            <Form form={editForm} layout="vertical" style={{ marginTop: 2 }}>
              <Alert
                type="info"
                showIcon
                message="Updates sync in real-time with your live Shopify store. Once required delivery fields are filled, this draft unlocks for conversion."
                style={{ marginBottom: 14 }}
              />

              <Row gutter={14}>
                <Col span={12}>
                  <Form.Item label={<span style={{ fontWeight: 500 }}>First Name</span>} name="firstName">
                    <Input placeholder="Recipient first name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={<span style={{ fontWeight: 500 }}>Last Name</span>} name="lastName">
                    <Input placeholder="Recipient last name" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={14}>
                <Col span={12}>
                  <Form.Item
                    label={<span style={{ fontWeight: 600 }}>Contact Phone (Required)</span>}
                    name="phone"
                    rules={[{ required: true, message: 'Customer phone number is required for COD delivery' }]}
                  >
                    <Input placeholder="e.g. +91 87901 62162" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={<span style={{ fontWeight: 500 }}>Customer Email</span>} name="email">
                    <Input placeholder="e.g. customer@example.com" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={14}>
                <Col span={14}>
                  <Form.Item
                    label={<span style={{ fontWeight: 600 }}>Address Line 1 (Required)</span>}
                    name="address1"
                    rules={[{ required: true, message: 'Street address / House number is required' }]}
                  >
                    <Input placeholder="Flat/House no., Building, Street, Area" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item label={<span style={{ fontWeight: 500 }}>Address Line 2 (Optional)</span>} name="address2">
                    <Input placeholder="Landmark, Apartment, Suite, etc." />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={7}>
                  <Form.Item
                    label={<span style={{ fontWeight: 600 }}>City (Required)</span>}
                    name="city"
                    rules={[{ required: true, message: 'City is required' }]}
                  >
                    <Input placeholder="e.g. Jojawar" />
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Form.Item
                    label={<span style={{ fontWeight: 600 }}>State (Required)</span>}
                    name="province"
                    rules={[{ required: true, message: 'State is required' }]}
                  >
                    <Input placeholder="e.g. Rajasthan" />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item
                    label={<span style={{ fontWeight: 600 }}>Pincode (Required)</span>}
                    name="zip"
                    rules={[{ required: true, message: 'Pincode is required' }]}
                  >
                    <Input placeholder="e.g. 306022" />
                  </Form.Item>
                </Col>
                <Col span={5}>
                  <Form.Item label={<span style={{ fontWeight: 500 }}>Country</span>} name="country">
                    <Input placeholder="India" />
                  </Form.Item>
                </Col>
              </Row>

              <div style={{
                background: '#0b1329',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 2
              }}>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: 13 }}>Cash-on-Delivery (COD) Tag</div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>Tags draft with "{config?.cod_marker_value || 'COD'}" so Shopify orders process as COD</div>
                </div>
                <Form.Item name="addCodTag" valuePropName="checked" style={{ margin: 0 }}>
                  <Switch checkedChildren="COD Tagged" unCheckedChildren="No Tag" />
                </Form.Item>
              </div>
            </Form>
          )}
        </Modal>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
