import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ListTree,
  Users,
  Plus,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  UserPlus,
  X,
  Search,
  Phone,
  Mail,
  MapPin,
  FileText,
  Check,
  Tag,
  FolderTree,
  Facebook,
  RotateCcw,
  Calendar,
  AlertCircle,
  Slash
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { OutlineNode, Person, DEPARTMENTS, RoleIconKey } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { ROLE_ICON_DEFINITIONS, renderRoleIcon, getRoleIconDefinition, isImportantRole } from '../lib/roleIcons';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function getDaysInMonth(month?: number): number {
  if (!month) return 31;
  if (month === 2) return 29; // February allows 29
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function formatBirthday(month?: number, day?: number): string {
  if (!month || !day) return '';
  const mStr = SHORT_MONTH_NAMES[month - 1] || '';
  return `${mStr} ${day}`;
}

function getDaysUntilNextBirthday(month?: number, day?: number): number {
  if (!month || !day) return 999999;
  const now = new Date();
  const currentYear = now.getFullYear();
  const todayMidnight = new Date(currentYear, now.getMonth(), now.getDate()).getTime();

  let nextBday = new Date(currentYear, month - 1, day).getTime();
  if (nextBday < todayMidnight) {
    nextBday = new Date(currentYear + 1, month - 1, day).getTime();
  }
  return Math.ceil((nextBday - todayMidnight) / (1000 * 60 * 60 * 24));
}

function normalizeAndValidateUrl(input: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { valid: true, normalized: '' };
  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  try {
    const url = new URL(normalized);
    if (!url.hostname || !url.hostname.includes('.')) {
      return { valid: false, normalized, error: 'Please enter a valid web address (e.g. facebook.com/name)' };
    }
    return { valid: true, normalized };
  } catch {
    return { valid: false, normalized, error: 'Please enter a valid web address' };
  }
}

export const PeopleMinistriesPage: React.FC = () => {
  const { isViewer } = useAuth();
  const {
    nodes,
    addNode,
    updateNode,
    deleteNode,
    indentNode,
    outdentNode,
    attachPersonToRole,
    detachPersonFromRole,
    people,
    addPerson,
    updatePerson,
    deletePerson,
    dataLoading
  } = useData();

  const [activeTab, setActiveTab] = useState<'outline' | 'people'>('people');

  // Outline state (starts collapsed by default)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [personInputNodeId, setPersonInputNodeId] = useState<string | null>(null);
  const [personInputValue, setPersonInputValue] = useState('');
  const [nodeToDelete, setNodeToDelete] = useState<OutlineNode | null>(null);

  // Icon Picker Popup for "Important" role
  const [iconPickerNode, setIconPickerNode] = useState<OutlineNode | null>(null);

  // People list filters & sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterBarangay, setFilterBarangay] = useState('');
  const [filterBirthdayMonth, setFilterBirthdayMonth] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'birthday' | 'recently-added'>('name-asc');

  // People modals
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [isSavingPerson, setIsSavingPerson] = useState(false);

  // Person form state
  const [personFormName, setPersonFormName] = useState('');
  const [personFormTitle, setPersonFormTitle] = useState<'Bro.' | 'Sis.' | 'none' | ''>('');
  const [personFormDepartment, setPersonFormDepartment] = useState('');
  const [personFormBirthdayMonth, setPersonFormBirthdayMonth] = useState<number | ''>('');
  const [personFormBirthdayDay, setPersonFormBirthdayDay] = useState<number | ''>('');
  const [personFormContactNumber, setPersonFormContactNumber] = useState('');
  const [personFormFacebookLink, setPersonFormFacebookLink] = useState('');
  const [personFormFacebookError, setPersonFormFacebookError] = useState<string | null>(null);
  const [personFormBarangay, setPersonFormBarangay] = useState('');
  const [personFormRoles, setPersonFormRoles] = useState<string[]>([]);
  const [personFormNotes, setPersonFormNotes] = useState('');

  // Auto-focus input helper
  const editInputRef = useRef<HTMLInputElement>(null);
  const personInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  useEffect(() => {
    if (personInputNodeId && personInputRef.current) {
      personInputRef.current.focus();
    }
  }, [personInputNodeId]);

  useEffect(() => {
    if (isPersonModalOpen && fullNameInputRef.current) {
      fullNameInputRef.current.focus();
    }
  }, [isPersonModalOpen]);

  // Organize outline nodes in hierarchical tree
  const treeNodes = useMemo(() => {
    const nodeMap: Record<string, OutlineNode[]> = {};
    for (const node of nodes) {
      const pId = node.parentId || 'root';
      if (!nodeMap[pId]) nodeMap[pId] = [];
      nodeMap[pId].push(node);
    }
    // Sort each group by order
    for (const key of Object.keys(nodeMap)) {
      nodeMap[key].sort((a, b) => a.order - b.order);
    }
    return nodeMap;
  }, [nodes]);

  // People lookup map
  const peopleMap = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people) {
      map.set(p.id, p);
    }
    return map;
  }, [people]);

  // Toggle expand / collapse (starts collapsed by default)
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Node editing
  const startRenameNode = (node: OutlineNode) => {
    setEditingNodeId(node.id);
    setEditingTitle(node.title);
    setRenameError(null);
  };

  const cancelRenameNode = () => {
    setEditingNodeId(null);
    setRenameError(null);
  };

  const saveRenameNode = async (nodeId: string) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setRenameError('Name cannot be empty');
      editInputRef.current?.focus();
      return;
    }

    setRenameError(null);
    setEditingNodeId(null);

    try {
      await updateNode(nodeId, { title: trimmed });
    } catch (err) {
      console.error('Error saving node rename:', err);
    }
  };

  // Add new node and open inline editor immediately (original automatic behavior)
  const handleAddNewNode = async (parentId = '', defaultTitle = 'New Item') => {
    const newId = await addNode(parentId, defaultTitle);
    if (newId) {
      if (parentId) {
        setExpandedNodes(prev => ({ ...prev, [parentId]: true }));
      }
      setEditingNodeId(newId);
      setEditingTitle(defaultTitle);
      setRenameError(null);
    }
  };

  // Important Role Toggle & Icon Selection
  const handleToggleImportant = async (node: OutlineNode, checked: boolean) => {
    if (checked) {
      // Checking opens the icon choices popup
      setIconPickerNode(node);
    } else {
      // Unchecking removes importance and icon immediately, no confirmation needed
      await updateNode(node.id, {
        isImportant: false,
        icon: 'none'
      });
    }
  };

  const handleSelectImportantIcon = async (iconKey: RoleIconKey) => {
    if (!iconPickerNode) return;
    const targetNodeId = iconPickerNode.id;
    setIconPickerNode(null);
    await updateNode(targetNodeId, {
      isImportant: true,
      icon: iconKey
    });
  };

  // Add person under node
  const handleAddPersonToNode = async (nodeId: string) => {
    const val = personInputValue.trim();
    if (!val) {
      // Pressing Enter on an empty box closes the input
      setPersonInputNodeId(null);
      setPersonInputValue('');
      return;
    }
    try {
      await attachPersonToRole(nodeId, val);
      // Save that name and immediately show another empty input box (focused)
      setPersonInputValue('');
      setPersonInputNodeId(nodeId);
      setTimeout(() => {
        personInputRef.current?.focus();
      }, 0);
    } catch (err) {
      console.error('Error attaching person:', err);
    }
  };

  // Move node order within siblings
  const moveNodeOrder = async (node: OutlineNode, direction: 'up' | 'down') => {
    const siblings = treeNodes[node.parentId || 'root'] || [];
    const index = siblings.findIndex(s => s.id === node.id);
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const targetNode = siblings[targetIdx];
    // Swap order
    await updateNode(node.id, { order: targetNode.order });
    await updateNode(targetNode.id, { order: node.order });
  };

  // Flatten outline nodes in hierarchical outline order with depth
  const flatOutlineTree = useMemo(() => {
    const treeMap: Record<string, OutlineNode[]> = {};
    for (const n of nodes) {
      const p = n.parentId || 'root';
      if (!treeMap[p]) treeMap[p] = [];
      treeMap[p].push(n);
    }
    for (const k of Object.keys(treeMap)) {
      treeMap[k].sort((a, b) => a.order - b.order);
    }

    const result: { node: OutlineNode; depth: number }[] = [];
    const traverse = (parentId: string, depth: number) => {
      const children = treeMap[parentId] || [];
      for (const child of children) {
        result.push({ node: child, depth });
        traverse(child.id, depth + 1);
      }
    };
    traverse('root', 0);
    return result;
  }, [nodes]);

  // Recursively collect descendant IDs for hierarchical role filtering
  const getDescendantNodeIds = (rootId: string): Set<string> => {
    const set = new Set<string>();
    const add = (id: string) => {
      set.add(id);
      for (const n of nodes) {
        if (n.parentId === id) {
          add(n.id);
        }
      }
    };
    add(rootId);
    return set;
  };

  // Unique barangays entered across existing people for autocomplete & filtering
  const uniqueBarangays = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      const b = p.barangay?.trim();
      if (b) set.add(b);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  // People form modal helpers
  const openNewPersonModal = () => {
    setEditingPerson(null);
    setPersonFormName('');
    setPersonFormTitle('');
    setPersonFormDepartment('');
    setPersonFormBirthdayMonth('');
    setPersonFormBirthdayDay('');
    setPersonFormContactNumber('');
    setPersonFormFacebookLink('');
    setPersonFormFacebookError(null);
    setPersonFormBarangay('');
    setPersonFormRoles([]);
    setPersonFormNotes('');
    setIsPersonModalOpen(true);
  };

  const openEditPersonModal = (p: Person) => {
    setEditingPerson(p);
    setPersonFormName(p.name || '');
    setPersonFormTitle((p.title || '') as any);
    setPersonFormDepartment(p.department || '');
    setPersonFormBirthdayMonth(p.birthdayMonth !== undefined ? p.birthdayMonth : '');
    setPersonFormBirthdayDay(p.birthdayDay !== undefined ? p.birthdayDay : '');
    setPersonFormContactNumber(p.contactNumber || p.phone || '');
    setPersonFormFacebookLink(p.facebookLink || '');
    setPersonFormFacebookError(null);
    setPersonFormBarangay(p.barangay || '');
    setPersonFormRoles(p.roles ? [...p.roles] : []);
    setPersonFormNotes(p.notes || '');
    setIsPersonModalOpen(true);
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personFormName.trim() || isSavingPerson) return;

    let validatedFb = '';
    if (personFormFacebookLink.trim()) {
      const fbRes = normalizeAndValidateUrl(personFormFacebookLink);
      if (!fbRes.valid) {
        setPersonFormFacebookError(fbRes.error || 'Please enter a valid web address');
        return;
      }
      validatedFb = fbRes.normalized;
    }

    const payload: Partial<Person> = {
      name: personFormName.trim(),
      ...(personFormTitle ? { title: personFormTitle } : {}),
      department: personFormDepartment || '',
      birthdayMonth: personFormBirthdayMonth !== '' ? Number(personFormBirthdayMonth) : undefined,
      birthdayDay: personFormBirthdayDay !== '' ? Number(personFormBirthdayDay) : undefined,
      contactNumber: personFormContactNumber.trim(),
      phone: personFormContactNumber.trim(),
      facebookLink: validatedFb,
      barangay: personFormBarangay.trim(),
      roles: personFormRoles,
      notes: personFormNotes.trim(),
    };

    setIsSavingPerson(true);
    try {
      if (editingPerson) {
        await updatePerson(editingPerson.id, payload);
      } else {
        await addPerson(personFormName.trim(), payload);
      }
      setIsPersonModalOpen(false);
    } finally {
      setIsSavingPerson(false);
    }
  };

  // Filtered & Sorted People Directory
  const filteredAndSortedPeople = useMemo(() => {
    const list = people.filter(p => {
      // 1. Search by name
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!p.name.toLowerCase().includes(q)) return false;
      }

      // 2. Filter by ministry/role (outline order; choosing parent includes sub-roles)
      if (filterRole) {
        const descendantIds = getDescendantNodeIds(filterRole);
        const hasMatchingRole = (p.roles || []).some(rId => descendantIds.has(rId));
        if (!hasMatchingRole) return false;
      }

      // 3. Filter by department
      if (filterDepartment) {
        if ((p.department || '') !== filterDepartment) return false;
      }

      // 4. Filter by barangay
      if (filterBarangay) {
        if ((p.barangay || '').trim().toLowerCase() !== filterBarangay.toLowerCase()) return false;
      }

      // 5. Filter by birthday month
      if (filterBirthdayMonth) {
        if (p.birthdayMonth !== Number(filterBirthdayMonth)) return false;
      }

      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === 'birthday') {
        const daysA = getDaysUntilNextBirthday(a.birthdayMonth, a.birthdayDay);
        const daysB = getDaysUntilNextBirthday(b.birthdayMonth, b.birthdayDay);
        if (daysA !== daysB) return daysA - daysB;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'recently-added') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      return 0;
    });

    return list;
  }, [people, searchQuery, filterRole, filterDepartment, filterBarangay, filterBirthdayMonth, sortBy, nodes]);

  const isFilterActive = !!(
    searchQuery.trim() ||
    filterRole ||
    filterDepartment ||
    filterBarangay ||
    filterBirthdayMonth ||
    sortBy !== 'name-asc'
  );

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterRole('');
    setFilterDepartment('');
    setFilterBarangay('');
    setFilterBirthdayMonth('');
    setSortBy('name-asc');
  };

  // Keyboard navigation within outline (Tab to indent, Shift+Tab to outdent)
  const handleOutlineKeyDown = (e: React.KeyboardEvent, node: OutlineNode) => {
    // If the event originated inside an input, textarea, button or select, do not trigger outline shortcuts
    const targetTag = (e.target as HTMLElement)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'BUTTON' || targetTag === 'SELECT') {
      return;
    }
    // Only handle if directly focused on the outline row container
    if (e.currentTarget !== e.target) {
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        outdentNode(node.id);
      } else {
        indentNode(node.id);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      // Create sibling node right after and open inline edit
      handleAddNewNode(node.parentId, 'New Item');
    }
  };

  // Recursive outline item renderer
  const renderOutlineBranch = (parentId: string, depth = 0) => {
    const children = treeNodes[parentId] || [];
    if (children.length === 0) return null;

    return (
      <div className={`space-y-1 ${depth > 0 ? 'ml-4 sm:ml-7 pl-2 sm:pl-3 border-l-2 border-subtle' : 'viewer-stagger-list'}`}>
        {children.map((node, index) => {
          const subChildren = treeNodes[node.id] || [];
          const hasChildren = subChildren.length > 0;
          const isExpanded = !!expandedNodes[node.id];
          const isEditing = editingNodeId === node.id;
          const attachedPeople = (node.assignedPeopleIds || [])
            .map(pId => peopleMap.get(pId))
            .filter(Boolean) as Person[];

          return (
            <div
              key={node.id}
              className="group py-1"
              tabIndex={isViewer ? undefined : 0}
              onKeyDown={isViewer ? undefined : (e) => handleOutlineKeyDown(e, node)}
            >
              {/* Row Container */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-surface hover:bg-surface-hover/80 border border-subtle/80 transition-colors shadow-2xs">
                {/* Left: Expand toggle, Bullet, Title, and Inline Person Badges */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  {/* Expand/Collapse Toggle or Neutral Bullet */}
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleExpand(node.id)}
                      className="p-1 rounded-md text-mut hover:text-main hover:bg-subtle transition-transform cursor-pointer"
                      aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-sec" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-sec" />
                      )}
                    </button>
                  ) : (
                    <div className="w-6 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                    </div>
                  )}

                  {/* Title / Rename Editor */}
                  {isEditing ? (
                    <div className="flex flex-col gap-1 flex-1 max-w-sm" data-edit-controls="true">
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => {
                            setEditingTitle(e.target.value);
                            if (renameError) setRenameError(null);
                          }}
                          onBlur={(e) => {
                            // If focus shifted to checkmark, X, or controls inside this box, do not blur
                            if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('[data-edit-controls="true"]')) {
                              return;
                            }
                            // Only save on blur if non-empty; if empty, cancel
                            const trimmed = editingTitle.trim();
                            if (trimmed) {
                              saveRenameNode(node.id);
                            } else {
                              cancelRenameNode();
                            }
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveRenameNode(node.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRenameNode();
                            }
                          }}
                          className={`px-2.5 py-1 text-sm font-semibold rounded-lg border bg-field text-main focus:outline-none w-full shadow-xs ${
                            renameError ? 'border-red-500 focus:ring-1 focus:ring-red-500' : 'border-accent'
                          }`}
                          placeholder="Ministry or role name"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => saveRenameNode(node.id)}
                          className="p-1 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 rounded transition-colors cursor-pointer flex-shrink-0"
                          title="Save changes (Enter)"
                          aria-label="Save changes"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => cancelRenameNode()}
                          className="p-1 text-mut hover:text-sec hover:bg-subtle rounded transition-colors cursor-pointer flex-shrink-0"
                          title="Cancel (Esc)"
                          aria-label="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {renameError && (
                        <span className="text-[11px] text-red-500 font-medium pl-1">
                          {renameError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Icon immediately to the LEFT of the role name (icon only, no text) */}
                      {isImportantRole(node) && node.icon && node.icon !== 'none' && (
                        isViewer ? (
                          <span
                            className="p-1 rounded-md text-accent shrink-0"
                            title={getRoleIconDefinition(node.icon)?.label}
                          >
                            {renderRoleIcon(node.icon, 'w-4 h-4')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIconPickerNode(node);
                            }}
                            className="p-1 rounded-md text-accent hover:bg-accent/15 transition-colors cursor-pointer shrink-0"
                            title={`Important role icon: ${getRoleIconDefinition(node.icon)?.label} (click to change)`}
                            aria-label={`Change icon for ${node.title}`}
                          >
                            {renderRoleIcon(node.icon, 'w-4 h-4')}
                          </button>
                        )
                      )}

                      <span
                        onClick={isViewer ? undefined : () => startRenameNode(node)}
                        className={`text-sm font-semibold text-main ${isViewer ? '' : 'cursor-pointer hover:text-accent transition-colors'}`}
                        title={isViewer ? undefined : 'Click to rename'}
                      >
                        {node.title}
                      </span>
                    </div>
                  )}

                  {/* People Attached to this Role/Node */}
                  <div className="flex flex-wrap items-center gap-1.5 ml-2">
                    {attachedPeople.map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-subtle border border-subtle text-sec hover:text-main"
                      >
                        <span>{p.name}</span>
                        {!isViewer && (
                          <button
                            type="button"
                            onClick={() => detachPersonFromRole(node.id, p.id)}
                            className="text-mut hover:text-red-500 transition-colors"
                            title={`Detach ${p.name} from ${node.title}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}

                    {/* Inline Quick Add Person Form */}
                    {!isViewer && (personInputNodeId === node.id ? (
                      <div className="inline-flex items-center gap-1">
                        <input
                          ref={personInputRef}
                          type="text"
                          value={personInputValue}
                          onChange={(e) => setPersonInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPersonToNode(node.id);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setPersonInputNodeId(null);
                              setPersonInputValue('');
                            }
                          }}
                          placeholder="Type person name & press Enter..."
                          autoFocus
                          className="px-2 py-0.5 text-xs rounded-md border border-accent bg-field text-main placeholder-mut focus:outline-none w-48 shadow-2xs"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleAddPersonToNode(node.id)}
                          className="p-1 rounded text-accent hover:bg-accent-tint cursor-pointer"
                          title="Add Person (Enter)"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setPersonInputNodeId(null);
                            setPersonInputValue('');
                          }}
                          className="p-1 rounded text-mut hover:text-sec cursor-pointer"
                          title="Cancel (Esc)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPersonInputNodeId(node.id);
                          setPersonInputValue('');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-mut hover:text-accent px-1.5 py-0.5 rounded hover:bg-subtle transition-colors cursor-pointer"
                        title="Attach person to this role"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Add Person</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: Actions (Important checkbox, divider, Outdent, Indent, Order, Add Child, Rename, Delete) */}
                {!isViewer && (
                <div className="flex items-center gap-1 text-mut">
                  {/* Important Checkbox (placed at left end of group, just before left arrow) */}
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold select-none cursor-pointer transition-colors ${
                      isImportantRole(node)
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : 'hover:bg-subtle text-sec hover:text-main border border-transparent'
                    }`}
                    title={isImportantRole(node) ? 'Important role (click to uncheck)' : 'Mark as Important role'}
                  >
                    <input
                      type="checkbox"
                      checked={isImportantRole(node)}
                      onChange={(e) => handleToggleImportant(node, e.target.checked)}
                      className="rounded text-amber-500 focus:ring-amber-500 border-subtle w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="hidden sm:inline text-[11px] font-semibold">Important</span>
                    <span className="sm:hidden text-[11px] font-semibold">★</span>
                  </label>

                  {/* Thin divider between Important checkbox and arrows */}
                  <div className="h-4 w-[1px] bg-subtle mx-0.5" />

                  {/* Outdent Button (Left arrow) */}
                  <button
                    type="button"
                    disabled={!node.parentId}
                    onClick={() => outdentNode(node.id)}
                    className="p-1.5 rounded-md hover:bg-subtle hover:text-main disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Outdent (Shift+Tab)"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Indent Button (Right arrow) */}
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => indentNode(node.id)}
                    className="p-1.5 rounded-md hover:bg-subtle hover:text-main disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Indent (Tab)"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Up */}
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveNodeOrder(node, 'up')}
                    className="p-1.5 rounded-md hover:bg-subtle hover:text-main disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  {/* Move Down */}
                  <button
                    type="button"
                    disabled={index === children.length - 1}
                    onClick={() => moveNodeOrder(node, 'down')}
                    className="p-1.5 rounded-md hover:bg-subtle hover:text-main disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Add Sub-item (Child) */}
                  <button
                    type="button"
                    onClick={() => handleAddNewNode(node.id, 'New Sub-item')}
                    className="p-1.5 rounded-md hover:bg-accent-tint hover:text-accent cursor-pointer"
                    title="Add Nested Item"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  {/* Rename */}
                  <button
                    type="button"
                    onClick={() => startRenameNode(node)}
                    className="p-1.5 rounded-md hover:bg-subtle hover:text-main cursor-pointer"
                    title="Rename"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => setNodeToDelete(node)}
                    className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 cursor-pointer"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                )}
              </div>

              {/* Render Children Recursively */}
              {isExpanded && renderOutlineBranch(node.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  const rootItems = treeNodes['root'] || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 motion-page-enter">
      {/* Page Header and Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-main">Members & Ministries</h1>
          <p className="text-sm text-sec mt-0.5">
            {isViewer
              ? 'View church ministries, roles, and member involvement.'
              : 'Organize church ministries, nested roles, and members in a linked relational directory.'}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle border border-subtle self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('people')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'people'
                ? 'bg-surface text-main shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-accent" />
            <span>Members List ({people.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExpandedNodes({});
              setActiveTab('outline');
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'outline'
                ? 'bg-surface text-main shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5 text-accent" />
            <span>Ministries Outline</span>
          </button>
        </div>
      </div>

      {dataLoading.people ? (
        <PageLoading />
      ) : (
        <>
      {/* ================= TAB 1: MINISTRIES OUTLINE ================= */}
      {activeTab === 'outline' && (
        <div className="space-y-4">
          {!isViewer && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-sec">
                <span className="font-semibold text-main">Tip:</span> Press <kbd className="px-1.5 py-0.5 bg-subtle rounded border border-subtle text-[11px] font-mono">Tab</kbd> to indent, <kbd className="px-1.5 py-0.5 bg-subtle rounded border border-subtle text-[11px] font-mono">Shift+Tab</kbd> to outdent, or use the arrow buttons.
              </div>
              <button
                type="button"
                onClick={() => handleAddNewNode('', 'New Ministry')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Top-Level Ministry</span>
              </button>
            </div>
          )}

          {rootItems.length === 0 ? (
            <div className="p-12 rounded-2xl bg-surface border border-subtle text-center space-y-4 shadow-card">
              <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
                <ListTree className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-semibold text-main">Your ministry outline is empty</h3>
                <p className="text-xs text-sec mt-1.5 leading-relaxed">
                  {isViewer
                    ? 'No church ministries or roles have been added yet.'
                    : 'Build your church structure with endless nesting. For example: create a ministry, indent sub-groups or roles under it, and attach volunteers to any role.'}
                </p>
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => handleAddNewNode('', 'Worship & Music')}
                  className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Ministry</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-6 space-y-2 motion-list-enter">
              {renderOutlineBranch('root')}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: PEOPLE DIRECTORY ================= */}
      {activeTab === 'people' && (
        <div className="space-y-4">
          {/* Top Controls: Search, Filters & Add Person */}
          <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search by Name */}
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-mut">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search people by name..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-mut hover:text-main"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Add Person Button */}
              {!isViewer && (
                <button
                  type="button"
                  onClick={openNewPersonModal}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Person</span>
                </button>
              )}
            </div>

            {/* Filters and Sorting Controls */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isViewer ? 'lg:grid-cols-3' : 'lg:grid-cols-5'} gap-3 pt-3 border-t border-subtle/70 text-xs`}>
              {/* Ministry / Role filter in outline order */}
              <div>
                <label className="block text-[11px] font-semibold text-mut uppercase tracking-wider mb-1">
                  Ministry / Role
                </label>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                >
                  <option value="">All Ministries / Roles</option>
                  {flatOutlineTree.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {depth > 0 ? '\u00A0\u00A0'.repeat(depth) + '↳ ' : ''}{node.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Department filter */}
              <div>
                <label className="block text-[11px] font-semibold text-mut uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                >
                  <option value="">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Barangay filter */}
              {!isViewer && (
                <div>
                  <label className="block text-[11px] font-semibold text-mut uppercase tracking-wider mb-1">
                    Barangay
                  </label>
                  <select
                    value={filterBarangay}
                    onChange={(e) => setFilterBarangay(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  >
                    <option value="">All Barangays</option>
                    {uniqueBarangays.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Birthday Month filter */}
              {!isViewer && (
                <div>
                  <label className="block text-[11px] font-semibold text-mut uppercase tracking-wider mb-1">
                    Birthday Month
                  </label>
                  <select
                    value={filterBirthdayMonth}
                    onChange={(e) => setFilterBirthdayMonth(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  >
                    <option value="">Any month</option>
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sort By */}
              <div>
                <label className="block text-[11px] font-semibold text-mut uppercase tracking-wider mb-1">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                >
                  <option value="name-asc">Name A to Z</option>
                  <option value="name-desc">Name Z to A</option>
                  {!isViewer && <option value="birthday">Upcoming birthday</option>}
                  {!isViewer && <option value="recently-added">Recently added</option>}
                </select>
              </div>
            </div>

            {/* Filter Status & Clear Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-subtle/50 text-xs">
              <span className="font-semibold text-sec">
                Showing {filteredAndSortedPeople.length} of {people.length} people
              </span>

              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-subtle bg-subtle hover:bg-surface-hover text-sec hover:text-main text-xs font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-accent" />
                  <span>Clear filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Empty State / People Directory Results (wrapped once so search/filters never replay fade) */}
          <div className="motion-list-enter">
          {filteredAndSortedPeople.length === 0 ? (
            <div className="p-12 rounded-2xl bg-surface border border-subtle text-center space-y-4 shadow-card">
              <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center">
                <Users className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-semibold text-main">
                  {isFilterActive ? 'No matching people found' : 'No people registered yet'}
                </h3>
                <p className="text-xs text-sec mt-1.5 leading-relaxed">
                  {isFilterActive
                    ? 'Try clearing or relaxing some of your filters to view more directory records.'
                    : isViewer
                      ? 'No church members have been added yet.'
                      : 'Add church members and volunteers here. Each person is stored once and can be assigned to multiple ministry roles.'}
                </p>
              </div>
              {isFilterActive ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-subtle hover:bg-surface-hover border border-subtle text-main transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-accent" />
                  <span>Clear All Filters</span>
                </button>
              ) : !isViewer ? (
                <button
                  type="button"
                  onClick={openNewPersonModal}
                  className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add First Person</span>
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop Table View (hidden on phones) */}
              <div className="hidden md:block bg-surface rounded-2xl border border-subtle shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-subtle bg-subtle/50 text-mut uppercase tracking-wider font-semibold">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Ministries / Roles</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Birthday</th>
                        {!isViewer && (
                          <>
                            <th className="py-3 px-4">Contact Number</th>
                            <th className="py-3 px-4">Barangay</th>
                            <th className="py-3 px-4 text-center">Facebook</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="">
                      {filteredAndSortedPeople.map((person) => {
                        const personRoles = (person.roles || [])
                          .map(rId => nodes.find(n => n.id === rId))
                          .filter(Boolean) as OutlineNode[];
                        const contactNum = person.contactNumber || person.phone;
                        const bdayStr = formatBirthday(person.birthdayMonth, person.birthdayDay);

                        return (
                          <tr key={person.id} className="border-b border-subtle last:border-b-0 hover:bg-surface-hover/70 transition-colors">
                            {/* Name */}
                            <td className="py-3 px-4 font-semibold text-main">
                              {isViewer ? (
                                <span>{person.name}</span>
                              ) : (
                                <span
                                  onClick={() => openEditPersonModal(person)}
                                  className="cursor-pointer hover:text-accent transition-colors"
                                >
                                  {person.name}
                                </span>
                              )}
                            </td>

                            {/* Ministries / Roles Chips with Parent in smaller text */}
                            <td className="py-3 px-4 max-w-xs">
                              <div className="flex flex-wrap gap-1.5">
                                {personRoles.length > 0 ? (
                                  personRoles.map(role => {
                                    const parent = role.parentId ? nodes.find(n => n.id === role.parentId) : null;
                                    return (
                                      <span
                                        key={role.id}
                                        className="inline-flex flex-col px-2 py-0.5 rounded-md bg-accent-tint text-accent text-xs"
                                      >
                                        {parent && (
                                          <span className="text-[9px] opacity-75 font-normal leading-tight">
                                            {parent.title}
                                          </span>
                                        )}
                                        <span className="font-semibold leading-tight">{role.title}</span>
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-mut italic text-[11px]">No roles assigned</span>
                                )}
                              </div>
                            </td>

                            {/* Department */}
                            <td className="py-3 px-4 text-sec">
                              {person.department ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-subtle text-sec border border-subtle">
                                  {person.department}
                                </span>
                              ) : (
                                <span className="text-mut italic text-[11px]">-</span>
                              )}
                            </td>

                            {/* Birthday (month & day only, e.g. Nov 12) */}
                            <td className="py-3 px-4 text-sec whitespace-nowrap">
                              {bdayStr ? (
                                <span className="font-medium text-main">{bdayStr}</span>
                              ) : (
                                <span className="text-mut italic text-[11px]">-</span>
                              )}
                            </td>

                            {/* Contact, Barangay, Facebook, Actions (Secretary only) */}
                            {!isViewer && (
                              <>
                                {/* Contact Number (tappable tel: link) */}
                                <td className="py-3 px-4 text-sec whitespace-nowrap">
                                  {contactNum ? (
                                    <a
                                      href={`tel:${contactNum}`}
                                      className="inline-flex items-center gap-1.5 text-accent hover:underline font-medium"
                                      title={`Call ${contactNum}`}
                                    >
                                      <Phone className="w-3 h-3 text-accent shrink-0" />
                                      <span>{contactNum}</span>
                                    </a>
                                  ) : (
                                    <span className="text-mut italic text-[11px]">-</span>
                                  )}
                                </td>

                                {/* Barangay */}
                                <td className="py-3 px-4 text-sec">
                                  {person.barangay ? (
                                    <span>{person.barangay}</span>
                                  ) : (
                                    <span className="text-mut italic text-[11px]">-</span>
                                  )}
                                </td>

                                {/* Facebook Icon link */}
                                <td className="py-3 px-4 text-center">
                                  {person.facebookLink ? (
                                    <a
                                      href={person.facebookLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-lg text-accent hover:bg-accent-tint transition-colors inline-flex items-center justify-center cursor-pointer"
                                      title="Open Facebook Profile"
                                    >
                                      <Facebook className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <span className="text-mut/30 inline-flex items-center justify-center p-1.5">
                                      <Facebook className="w-4 h-4 opacity-30" />
                                    </span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openEditPersonModal(person)}
                                      className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                                      title="Edit Person Details"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPersonToDelete(person)}
                                      className="p-1.5 rounded-lg text-sec hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                      title="Delete Person"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View (shown on phones) */}
              <div className="md:hidden space-y-3">
                {filteredAndSortedPeople.map((person) => {
                  const personRoles = (person.roles || [])
                    .map(rId => nodes.find(n => n.id === rId))
                    .filter(Boolean) as OutlineNode[];
                  const contactNum = person.contactNumber || person.phone;
                  const bdayStr = formatBirthday(person.birthdayMonth, person.birthdayDay);

                  return (
                    <div
                      key={person.id}
                      className="p-4 rounded-2xl bg-surface border border-subtle shadow-card space-y-2.5 viewer-card"
                    >
                      {/* Card Header: Name + Badges + Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {isViewer ? (
                            <div className="font-bold text-sm text-main text-left">
                              {person.name}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEditPersonModal(person)}
                              className="font-bold text-sm text-main hover:text-accent text-left transition-colors cursor-pointer"
                            >
                              {person.name}
                            </button>
                          )}
                          {(person.department || bdayStr) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {person.department && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-subtle text-sec border border-subtle">
                                  {person.department}
                                </span>
                              )}
                              {bdayStr && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-tint text-accent flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5" />
                                  <span>{bdayStr}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Top Right Actions */}
                        {!isViewer && (
                          <div className="flex items-center gap-1">
                            {person.facebookLink && (
                              <a
                                href={person.facebookLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-accent hover:bg-accent-tint transition-colors"
                                title="Facebook Profile"
                              >
                                <Facebook className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditPersonModal(person)}
                              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                              title="Edit Person"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPersonToDelete(person)}
                              className="p-1.5 rounded-lg text-sec hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                              title="Delete Person"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Contact Number & Barangay */}
                      {!isViewer && (contactNum || person.barangay) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-sec pt-1">
                          {contactNum && (
                            <a
                              href={`tel:${contactNum}`}
                              className="inline-flex items-center gap-1.5 text-accent hover:underline font-medium"
                            >
                              <Phone className="w-3 h-3 text-accent" />
                              <span>{contactNum}</span>
                            </a>
                          )}
                          {person.barangay && (
                            <span className="inline-flex items-center gap-1 text-sec">
                              <MapPin className="w-3 h-3 text-mut" />
                              <span>{person.barangay}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Ministries & Roles */}
                      {personRoles.length > 0 && (
                        <div className="pt-2 border-t border-subtle/50 flex flex-wrap gap-1.5">
                          {personRoles.map(role => {
                            const parent = role.parentId ? nodes.find(n => n.id === role.parentId) : null;
                            return (
                              <span
                                key={role.id}
                                className="inline-flex flex-col px-2 py-0.5 rounded-md bg-accent-tint text-accent text-[11px]"
                              >
                                {parent && (
                                  <span className="text-[9px] opacity-75 font-normal leading-tight">
                                    {parent.title}
                                  </span>
                                )}
                                <span className="font-semibold leading-tight">{role.title}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </div>
        </div>
      )}
        </>
      )}

      {/* Datalist for Barangay Autocomplete */}
      <datalist id="barangay-suggestions">
        {uniqueBarangays.map(b => (
          <option key={b} value={b} />
        ))}
      </datalist>

      {/* Person Add / Edit Modal */}
      {!isViewer && isPersonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto motion-backdrop-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 my-8 motion-popup-in">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="text-base font-bold text-main">
                {editingPerson ? 'Edit Person Details' : 'Add New Person'}
              </h3>
              <button
                type="button"
                onClick={() => setIsPersonModalOpen(false)}
                className="p-1 rounded-lg text-mut hover:text-main cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePerson} className="space-y-4 text-xs">
              {/* Full Name (full width, auto-focused) */}
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <input
                  ref={fullNameInputRef}
                  autoFocus
                  type="text"
                  required
                  value={personFormName}
                  onChange={(e) => setPersonFormName(e.target.value)}
                  placeholder="e.g. Sandra Miller"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Department & Birthday Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Department */}
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <select
                    value={personFormDepartment}
                    onChange={(e) => setPersonFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  >
                    <option value="">-- Choose department --</option>
                    {DEPARTMENTS.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Birthday Month & Day */}
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                    Birthday (Month & Day)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={personFormBirthdayMonth}
                      onChange={(e) => {
                        const mVal = e.target.value === '' ? '' : Number(e.target.value);
                        setPersonFormBirthdayMonth(mVal);
                        const newMaxDays = getDaysInMonth(mVal === '' ? undefined : mVal);
                        if (personFormBirthdayDay !== '' && Number(personFormBirthdayDay) > newMaxDays) {
                          setPersonFormBirthdayDay(newMaxDays);
                        }
                      }}
                      className="w-full px-2 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    >
                      <option value="">Month</option>
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>

                    <select
                      value={personFormBirthdayDay}
                      onChange={(e) => setPersonFormBirthdayDay(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-2 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                    >
                      <option value="">Day</option>
                      {Array.from(
                        { length: getDaysInMonth(personFormBirthdayMonth !== '' ? Number(personFormBirthdayMonth) : undefined) },
                        (_, i) => i + 1
                      ).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Number & Facebook Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Contact Number */}
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={personFormContactNumber}
                    onChange={(e) => setPersonFormContactNumber(e.target.value)}
                    placeholder="e.g. 0917-123-4567"
                    className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  />
                </div>

                {/* Facebook Link */}
                <div>
                  <label className="block font-semibold text-main uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Facebook className="w-3 h-3 text-accent" />
                    <span>Facebook Profile Link</span>
                  </label>
                  <input
                    type="text"
                    value={personFormFacebookLink}
                    onChange={(e) => {
                      setPersonFormFacebookLink(e.target.value);
                      if (personFormFacebookError) setPersonFormFacebookError(null);
                    }}
                    onBlur={() => {
                      if (personFormFacebookLink.trim()) {
                        const res = normalizeAndValidateUrl(personFormFacebookLink);
                        if (!res.valid) {
                          setPersonFormFacebookError(res.error || 'Please enter a valid web address');
                        } else {
                          setPersonFormFacebookLink(res.normalized);
                          setPersonFormFacebookError(null);
                        }
                      }
                    }}
                    placeholder="e.g. facebook.com/name"
                    className={`w-full px-3 py-2 rounded-xl border bg-field text-main text-xs focus:outline-none focus:ring-2 ${
                      personFormFacebookError
                        ? 'border-red-500 focus:ring-red-400/40 focus:border-red-500'
                        : 'border-subtle focus:ring-accent/40 focus:border-accent'
                    }`}
                  />
                  {personFormFacebookError && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{personFormFacebookError}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Barangay with autocomplete datalist suggestions */}
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Barangay
                </label>
                <input
                  type="text"
                  list="barangay-suggestions"
                  value={personFormBarangay}
                  onChange={(e) => setPersonFormBarangay(e.target.value)}
                  placeholder="e.g. Barangay San Jose (type or pick from list)"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Ministries & Roles Multi-Select (Hierarchical in outline order) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-main uppercase tracking-wider">
                    Ministries & Roles
                  </label>
                  <span className="text-[11px] text-mut font-medium">
                    {personFormRoles.length} selected
                  </span>
                </div>
                <p className="text-[11px] text-mut mb-2">
                  Select all roles this person serves in. Sub-roles are indented under their ministry.
                </p>

                <div className="max-h-48 overflow-y-auto rounded-xl border border-subtle bg-subtle/30 p-2 space-y-1">
                  {flatOutlineTree.length === 0 ? (
                    <p className="text-xs text-mut italic p-2">No ministry roles created yet in the outline.</p>
                  ) : (
                    flatOutlineTree.map(({ node, depth }) => {
                      const isChecked = personFormRoles.includes(node.id);
                      const memberCount = (node.assignedPeopleIds || []).length;

                      return (
                        <label
                          key={node.id}
                          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors select-none ${
                            isChecked
                              ? 'bg-accent-tint/70 text-main font-semibold'
                              : 'hover:bg-surface text-sec font-normal'
                          }`}
                          style={{ paddingLeft: `${10 + depth * 16}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setPersonFormRoles(prev =>
                                prev.includes(node.id)
                                  ? prev.filter(id => id !== node.id)
                                  : [...prev, node.id]
                              );
                            }}
                            className="rounded text-accent focus:ring-accent border-subtle w-4 h-4 cursor-pointer"
                          />
                          <span className="flex-1 flex items-center gap-1.5 truncate">
                            {depth > 0 && <span className="text-mut text-[10px]">↳</span>}
                            <span className={depth === 0 ? 'font-semibold text-main' : 'text-main'}>
                              {node.title}
                            </span>
                          </span>
                          <span className="text-[11px] text-mut shrink-0 font-normal">
                            {memberCount} {memberCount === 1 ? 'person' : 'people'}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Secretary Notes */}
              <div>
                <label className="block font-semibold text-main uppercase tracking-wider mb-1.5">
                  Secretary Notes
                </label>
                <textarea
                  rows={2}
                  value={personFormNotes}
                  onChange={(e) => setPersonFormNotes(e.target.value)}
                  placeholder="e.g. Prefers morning rosters; available on 2nd and 4th Sundays..."
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none"
                />
              </div>

              <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingPerson}
                  onClick={() => setIsPersonModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec font-medium cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPerson}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast font-medium shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSavingPerson ? (
                    <>
                      <Spinner size="xs" variant="contrast" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingPerson ? 'Save Changes' : 'Create Person'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: IMPORTANT ROLE ICON PICKER ================= */}
      {!isViewer && iconPickerNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIconPickerNode(null)}
        >
          <div
            className="w-full max-w-md p-6 rounded-2xl bg-surface border border-subtle shadow-xl text-main space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div>
                <h3 className="text-lg font-bold text-main">
                  Important Role Icon
                </h3>
                <p className="text-xs text-sec mt-0.5">
                  Select an icon for <span className="font-semibold text-main">"{iconPickerNode.title}"</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIconPickerNode(null)}
                className="p-1 rounded-lg text-mut hover:text-main cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Exactly the 6 Icon Choices: large, easy to tap, name as small caption */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
              {ROLE_ICON_DEFINITIONS.map((iconDef) => {
                const isSelected = iconPickerNode.icon === iconDef.key;
                return (
                  <button
                    key={iconDef.key}
                    type="button"
                    onClick={() => handleSelectImportantIcon(iconDef.key)}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all cursor-pointer group min-h-[96px] ${
                      isSelected
                        ? 'border-accent bg-accent/15 text-accent ring-2 ring-accent/40 shadow-xs'
                        : 'border-subtle bg-surface hover:bg-subtle hover:border-accent/50 text-main'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isSelected ? 'bg-accent/25 text-accent' : 'bg-subtle text-accent'
                    }`}>
                      {iconDef.renderIcon({ className: 'w-6 h-6' })}
                    </div>
                    <span className="text-xs font-semibold text-main mt-2 tracking-tight">
                      {iconDef.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-subtle flex items-center justify-between">
              <span className="text-[11px] text-mut">
                Click an icon to apply, or cancel to keep unchecked.
              </span>
              <button
                type="button"
                onClick={() => setIconPickerNode(null)}
                className="px-4 py-2 rounded-xl border border-subtle text-sec hover:text-main text-xs font-medium hover:bg-subtle cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Node Deletion */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!nodeToDelete}
          title={`Delete "${nodeToDelete?.title}"?`}
          message="Deleting this item will also remove any nested sub-roles. People assigned to this role will remain safely in the People directory and will not be deleted."
          confirmLabel="Delete Item"
          onConfirm={async () => {
            if (nodeToDelete) {
              await deleteNode(nodeToDelete.id);
              setNodeToDelete(null);
            }
          }}
          onCancel={() => setNodeToDelete(null)}
        />
      )}

      {/* Confirmation Modal for Person Deletion */}
      {!isViewer && (
        <ConfirmModal
          isOpen={!!personToDelete}
          title={`Delete "${personToDelete?.name}"?`}
          message="This person will be permanently removed from the church directory and detached from all roles. Their historical assignments will be cleaned up."
          confirmLabel="Delete Person"
          onConfirm={async () => {
            if (personToDelete) {
              await deletePerson(personToDelete.id);
              setPersonToDelete(null);
            }
          }}
          onCancel={() => setPersonToDelete(null)}
        />
      )}
    </div>
  );
};
