import React, { useState, useEffect } from 'react';
import { socialApi } from '../api-social';

// Platform colors
const PLATFORM_COLORS = {
  LinkedIn: { bg: 'bg-[#0077B5]', text: 'text-white', border: 'border-[#0077B5]' },
  Instagram: { bg: 'bg-[#E4405F]', text: 'text-white', border: 'border-[#E4405F]' },
  X: { bg: 'bg-black', text: 'text-white', border: 'border-black' }
};

// Status colors
const STATUS_COLORS = {
  idea: { bg: 'bg-gray-500', text: 'text-white' },
  draft: { bg: 'bg-yellow-500', text: 'text-black' },
  review: { bg: 'bg-blue-500', text: 'text-white' },
  scheduled: { bg: 'bg-purple-500', text: 'text-white' },
  published: { bg: 'bg-emerald-500', text: 'text-white' }
};

const TONE_OPTIONS = [
  'Professionell', 'Locker', 'Inspirierend', 'Edukativ', 'Mix'
];

const FREQUENCY_OPTIONS = [
  'Täglich', '3x/Woche', '2x/Woche', '1x/Woche'
];

const PLATFORMS = ['LinkedIn', 'Instagram', 'X'];
const STATUS_OPTIONS = ['idea', 'draft', 'review', 'scheduled', 'published'];

// Template options
const TEMPLATES = {
  quote: { label: 'Zitat', icon: '💬', color: '#6366f1' },
  tips: { label: 'Tipps', icon: '💡', color: '#10b981' },
  checklist: { label: 'Checkliste', icon: '✅', color: '#f59e0b' },
  stats: { label: 'Statistik', icon: '📊', color: '#8b5cf6' },
  text: { label: 'Text-Post', icon: '📝', color: '#ef4444' }
};

// Format options
const FORMATS = {
  'instagram-square': { label: 'Instagram Post', width: 1080, height: 1080 },
  'linkedin-post': { label: 'LinkedIn Post', width: 1200, height: 628 },
  'story': { label: 'Story', width: 1080, height: 1920 },
  'custom': { label: 'Benutzerdefiniert', width: 1080, height: 1080 }
};

export default function SocialMedia() {
  // State
  const [activeView, setActiveView] = useState('calendar'); // 'calendar' | 'profile'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [posts, setPosts] = useState([]);
  const [profile, setProfile] = useState({
    topics: [],
    targetAudience: '',
    tone: '',
    platforms: [],
    postingFrequency: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showPostModal, setShowPostModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showGraphicsModal, setShowGraphicsModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [activePostTab, setActivePostTab] = useState('basic'); // 'basic' | 'graphics'
  
  // Form states
  const [postForm, setPostForm] = useState({
    title: '',
    content: '',
    platform: 'LinkedIn',
    status: 'idea',
    scheduled_date: '',
    hashtags: [],
    notes: ''
  });
  const [profileForm, setProfileForm] = useState({ ...profile });
  const [hashtagInput, setHashtagInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  
  // Graphics state
  const [selectedTemplate, setSelectedTemplate] = useState('quote');
  const [selectedFormat, setSelectedFormat] = useState('instagram-square');
  const [templateData, setTemplateData] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [renderLoading, setRenderLoading] = useState(false);

  // Load data
  useEffect(() => {
    loadPosts();
    loadProfile();
  }, [currentDate, selectedPlatform]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const params = {
        month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
      };
      if (selectedPlatform !== 'all') {
        params.platform = selectedPlatform;
      }
      const data = await socialApi.getPosts(params);
      setPosts(data);
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const data = await socialApi.getProfile();
      setProfile(data);
      setProfileForm(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  // Calendar helpers
  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days = [];
    const current = new Date(startDate);
    
    while (current <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  };

  const getPostsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return posts.filter(post => 
      (post.scheduled_date && post.scheduled_date.startsWith(dateStr)) ||
      (post.created_at && post.created_at.startsWith(dateStr))
    );
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  // Handlers
  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setPostForm({
      ...postForm,
      scheduled_date: date.toISOString().split('T')[0]
    });
    setEditingPost(null);
    setShowPostModal(true);
  };

  const handlePostClick = (post) => {
    setEditingPost(post);
    setPostForm({
      title: post.title,
      content: post.content,
      platform: post.platform,
      status: post.status,
      scheduled_date: post.scheduled_date || '',
      hashtags: post.hashtags || [],
      notes: post.notes || ''
    });
    setHashtagInput(post.hashtags ? post.hashtags.join(', ') : '');
    setShowPostModal(true);
  };

  const handleSavePost = async () => {
    try {
      const postData = {
        ...postForm,
        hashtags: hashtagInput.split(',').map(tag => tag.trim()).filter(tag => tag)
      };
      
      if (editingPost) {
        await socialApi.updatePost(editingPost.id, postData);
      } else {
        await socialApi.createPost(postData);
      }
      
      await loadPosts();
      setShowPostModal(false);
      setEditingPost(null);
      setPostForm({
        title: '',
        content: '',
        platform: 'LinkedIn',
        status: 'idea',
        scheduled_date: '',
        hashtags: [],
        notes: ''
      });
      setHashtagInput('');
    } catch (error) {
      console.error('Failed to save post:', error);
      alert('Fehler beim Speichern des Posts');
    }
  };

  const handleDeletePost = async () => {
    if (!editingPost) return;
    
    if (confirm('Post wirklich löschen?')) {
      try {
        await socialApi.deletePost(editingPost.id);
        await loadPosts();
        setShowPostModal(false);
        setEditingPost(null);
      } catch (error) {
        console.error('Failed to delete post:', error);
        alert('Fehler beim Löschen des Posts');
      }
    }
  };

  const handleSaveProfile = async () => {
    try {
      const profileData = {
        ...profileForm,
        topics: topicInput.split(',').map(topic => topic.trim()).filter(topic => topic)
      };
      
      await socialApi.updateProfile(profileData);
      setProfile(profileData);
      alert('Content-Profil gespeichert!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Fehler beim Speichern des Profils');
    }
  };

  const handleGeneratePlan = async (timeframe, platform) => {
    try {
      setLoading(true);
      const result = await socialApi.generatePlan({ timeframe, platform });
      alert(`Plan generiert!\n\n${result.plan}`);
      setShowGenerateModal(false);
      await loadPosts();
    } catch (error) {
      console.error('Failed to generate plan:', error);
      alert('Fehler beim Generieren des Plans');
    } finally {
      setLoading(false);
    }
  };

  // Set initial topic input when profile loads
  useEffect(() => {
    if (profile.topics) {
      setTopicInput(profile.topics.join(', '));
    }
  }, [profile.topics]);

  // Graphics Handlers
  const handleTemplateChange = (template) => {
    setSelectedTemplate(template);
    setTemplateData({}); // Reset template data when changing template
    setPreviewImage(null); // Clear preview
  };

  const handlePreviewRender = async () => {
    try {
      setRenderLoading(true);
      const format = FORMATS[selectedFormat];
      const width = selectedFormat === 'custom' ? customWidth : format.width;
      const height = selectedFormat === 'custom' ? customHeight : format.height;
      
      const result = await socialApi.renderPreview({
        template: selectedTemplate,
        data: templateData,
        width,
        height
      });
      
      setPreviewImage(result.image);
    } catch (error) {
      console.error('Failed to generate preview:', error);
      alert('Fehler beim Generieren der Vorschau');
    } finally {
      setRenderLoading(false);
    }
  };

  const handleDownloadRender = async () => {
    try {
      setRenderLoading(true);
      const format = FORMATS[selectedFormat];
      const width = selectedFormat === 'custom' ? customWidth : format.width;
      const height = selectedFormat === 'custom' ? customHeight : format.height;
      
      await socialApi.renderDownload({
        template: selectedTemplate,
        data: templateData,
        width,
        height,
        scale: 2 // High resolution for download
      });
    } catch (error) {
      console.error('Failed to download:', error);
      alert('Fehler beim Herunterladen');
    } finally {
      setRenderLoading(false);
    }
  };

  const handleSaveRender = async () => {
    try {
      setRenderLoading(true);
      const format = FORMATS[selectedFormat];
      const width = selectedFormat === 'custom' ? customWidth : format.width;
      const height = selectedFormat === 'custom' ? customHeight : format.height;
      
      const result = await socialApi.renderSave({
        template: selectedTemplate,
        data: templateData,
        width,
        height,
        scale: 2
      });
      
      alert(`Bild erfolgreich in der Mediathek gespeichert!\nDatei: ${result.filename}`);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Fehler beim Speichern in der Mediathek');
    } finally {
      setRenderLoading(false);
    }
  };

  const resetGraphicsForm = () => {
    setSelectedTemplate('quote');
    setSelectedFormat('instagram-square');
    setTemplateData({});
    setPreviewImage(null);
    setCustomWidth(1080);
    setCustomHeight(1080);
  };

  return (
    <div className="flex h-full bg-gray-900 text-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 p-4 border-r border-gray-700">
        <h2 className="text-xl font-bold mb-6">📱 Social Media</h2>
        
        {/* Navigation */}
        <div className="space-y-2 mb-6">
          <button
            onClick={() => setActiveView('calendar')}
            className={`w-full text-left p-3 rounded ${
              activeView === 'calendar' ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
          >
            📅 Redaktionskalender
          </button>
          <button
            onClick={() => setActiveView('profile')}
            className={`w-full text-left p-3 rounded ${
              activeView === 'profile' ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
          >
            📝 Content-Profil
          </button>
        </div>

        {/* Platform Filter */}
        {activeView === 'calendar' && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-2">Plattform-Filter</h3>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded p-2"
            >
              <option value="all">Alle Plattformen</option>
              {PLATFORMS.map(platform => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </div>
        )}

        {/* Generate Plan Button */}
        {activeView === 'calendar' && (
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 p-3 rounded font-medium"
          >
            🐢 Plan generieren
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        {activeView === 'calendar' ? (
          // Calendar View
          <div>
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Redaktionskalender</h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 hover:bg-gray-700 rounded"
                >
                  ←
                </button>
                <span className="text-lg font-medium">
                  {currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-gray-700 rounded"
                >
                  →
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-gray-800 rounded-lg p-4">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-gray-400">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {getMonthDays().map((date, index) => {
                  const dayPosts = getPostsForDate(date);
                  const isCurrentMonthDay = isCurrentMonth(date);
                  
                  return (
                    <div
                      key={index}
                      onClick={() => handleDateClick(date)}
                      className={`min-h-[120px] p-2 border border-gray-700 rounded cursor-pointer hover:bg-gray-700 ${
                        isToday(date) ? 'bg-blue-900 border-blue-600' : 'bg-gray-900'
                      } ${!isCurrentMonthDay ? 'opacity-50' : ''}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${
                        isToday(date) ? 'text-blue-300' : 'text-gray-300'
                      }`}>
                        {date.getDate()}
                      </div>
                      
                      {/* Post Chips */}
                      <div className="space-y-1">
                        {dayPosts.slice(0, 3).map(post => {
                          const platformColor = PLATFORM_COLORS[post.platform] || PLATFORM_COLORS.LinkedIn;
                          return (
                            <div
                              key={post.id}
                              onClick={(e) => { e.stopPropagation(); handlePostClick(post); }}
                              className={`text-xs px-2 py-1 rounded truncate ${platformColor.bg} ${platformColor.text}`}
                              title={post.title}
                            >
                              {post.title}
                            </div>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <div className="text-xs text-gray-400">
                            +{dayPosts.length - 3} weitere
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          // Profile View
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold mb-6">Content-Profil</h1>
            
            <div className="bg-gray-800 rounded-lg p-6 space-y-6">
              {/* Themen */}
              <div>
                <label className="block text-sm font-medium mb-2">Themen (kommagetrennt)</label>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="z.B. Technologie, Marketing, Produktivität"
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                />
              </div>

              {/* Zielgruppe */}
              <div>
                <label className="block text-sm font-medium mb-2">Zielgruppe</label>
                <textarea
                  value={profileForm.targetAudience}
                  onChange={(e) => setProfileForm({ ...profileForm, targetAudience: e.target.value })}
                  placeholder="Beschreiben Sie Ihre Zielgruppe..."
                  rows="3"
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                />
              </div>

              {/* Tonalität */}
              <div>
                <label className="block text-sm font-medium mb-2">Tonalität</label>
                <select
                  value={profileForm.tone}
                  onChange={(e) => setProfileForm({ ...profileForm, tone: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                >
                  <option value="">Tonalität wählen...</option>
                  {TONE_OPTIONS.map(tone => (
                    <option key={tone} value={tone}>{tone}</option>
                  ))}
                </select>
              </div>

              {/* Plattformen */}
              <div>
                <label className="block text-sm font-medium mb-2">Plattformen</label>
                <div className="space-y-2">
                  {PLATFORMS.map(platform => (
                    <label key={platform} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={profileForm.platforms.includes(platform)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setProfileForm({
                              ...profileForm,
                              platforms: [...profileForm.platforms, platform]
                            });
                          } else {
                            setProfileForm({
                              ...profileForm,
                              platforms: profileForm.platforms.filter(p => p !== platform)
                            });
                          }
                        }}
                        className="mr-2"
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>

              {/* Posting-Frequenz */}
              <div>
                <label className="block text-sm font-medium mb-2">Posting-Frequenz</label>
                <select
                  value={profileForm.postingFrequency}
                  onChange={(e) => setProfileForm({ ...profileForm, postingFrequency: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                >
                  <option value="">Frequenz wählen...</option>
                  {FREQUENCY_OPTIONS.map(freq => (
                    <option key={freq} value={freq}>{freq}</option>
                  ))}
                </select>
              </div>

              {/* Notizen */}
              <div>
                <label className="block text-sm font-medium mb-2">Notizen</label>
                <textarea
                  value={profileForm.notes}
                  onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                  placeholder="Zusätzliche Notizen und Kontext..."
                  rows="4"
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveProfile}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-medium"
              >
                Profil speichern
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Post Modal */}
      {showPostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingPost ? 'Post bearbeiten' : 'Neuer Post'}
            </h2>
            
            {/* Tabs */}
            <div className="flex space-x-1 mb-6 bg-gray-700 p-1 rounded-lg">
              <button
                onClick={() => setActivePostTab('basic')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activePostTab === 'basic' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                📝 Post Details
              </button>
              <button
                onClick={() => setActivePostTab('graphics')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activePostTab === 'graphics' 
                    ? 'bg-gray-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                🎨 Grafik erstellen
              </button>
            </div>
            
            {activePostTab === 'basic' ? (
            <div className="space-y-4">
              {/* Titel */}
              <div>
                <label className="block text-sm font-medium mb-2">Titel</label>
                <input
                  type="text"
                  value={postForm.title}
                  onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  placeholder="Post-Titel..."
                />
              </div>

              {/* Platform & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Plattform</label>
                  <select
                    value={postForm.platform}
                    onChange={(e) => setPostForm({ ...postForm, platform: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  >
                    {PLATFORMS.map(platform => (
                      <option key={platform} value={platform}>{platform}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Status</label>
                  <select
                    value={postForm.status}
                    onChange={(e) => setPostForm({ ...postForm, status: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  >
                    {STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium mb-2">Content</label>
                <textarea
                  value={postForm.content}
                  onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                  rows="6"
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  placeholder="Post-Inhalt..."
                />
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="block text-sm font-medium mb-2">Geplantes Datum</label>
                <input
                  type="date"
                  value={postForm.scheduled_date}
                  onChange={(e) => setPostForm({ ...postForm, scheduled_date: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                />
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-medium mb-2">Hashtags (kommagetrennt)</label>
                <input
                  type="text"
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  placeholder="#marketing, #socialmedia, #content"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-2">Notizen</label>
                <textarea
                  value={postForm.notes}
                  onChange={(e) => setPostForm({ ...postForm, notes: e.target.value })}
                  rows="3"
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                  placeholder="Interne Notizen..."
                />
              </div>

              {/* Preview */}
              {postForm.content && (
                <div>
                  <label className="block text-sm font-medium mb-2">Vorschau</label>
                  <div className="bg-gray-900 border border-gray-600 rounded p-4">
                    <div className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${
                      PLATFORM_COLORS[postForm.platform]?.bg || 'bg-gray-600'
                    } ${PLATFORM_COLORS[postForm.platform]?.text || 'text-white'}`}>
                      {postForm.platform}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{postForm.content}</div>
                    {hashtagInput && (
                      <div className="text-blue-400 text-sm mt-2">
                        {hashtagInput.split(',').map(tag => tag.trim()).filter(tag => tag).map(tag => 
                          tag.startsWith('#') ? tag : `#${tag}`
                        ).join(' ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            ) : (
            // Graphics Tab
            <div className="space-y-6">
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Template wählen</label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(TEMPLATES).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => handleTemplateChange(key)}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        selectedTemplate === key
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="text-2xl mb-1">{template.icon}</div>
                      <div className="text-sm font-medium">{template.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Format</label>
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                >
                  {Object.entries(FORMATS).map(([key, format]) => (
                    <option key={key} value={key}>
                      {format.label} ({format.width}×{format.height})
                    </option>
                  ))}
                </select>
                
                {selectedFormat === 'custom' && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Breite</label>
                      <input
                        type="number"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1080)}
                        className="w-full bg-gray-700 border border-gray-600 rounded p-2"
                        min="100"
                        max="3000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Höhe</label>
                      <input
                        type="number"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(parseInt(e.target.value) || 1080)}
                        className="w-full bg-gray-700 border border-gray-600 rounded p-2"
                        min="100"
                        max="3000"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Template-specific fields */}
              {selectedTemplate === 'quote' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Zitat</label>
                    <textarea
                      value={templateData.quote || ''}
                      onChange={(e) => setTemplateData({ ...templateData, quote: e.target.value })}
                      placeholder="Ein inspirierendes Zitat..."
                      rows="3"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Autor</label>
                    <input
                      type="text"
                      value={templateData.author || ''}
                      onChange={(e) => setTemplateData({ ...templateData, author: e.target.value })}
                      placeholder="Autor des Zitats"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Brand-Farbe (optional)</label>
                    <input
                      type="color"
                      value={templateData.brandColor || '#6366f1'}
                      onChange={(e) => setTemplateData({ ...templateData, brandColor: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 h-12"
                    />
                  </div>
                </div>
              )}

              {selectedTemplate === 'tips' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Titel</label>
                    <input
                      type="text"
                      value={templateData.title || ''}
                      onChange={(e) => setTemplateData({ ...templateData, title: e.target.value })}
                      placeholder="z.B. 5 Tipps für bessere Produktivität"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Tipps (einer pro Zeile, max. 5)</label>
                    <textarea
                      value={templateData.tips?.join('\n') || ''}
                      onChange={(e) => setTemplateData({ ...templateData, tips: e.target.value.split('\n').filter(tip => tip.trim()) })}
                      placeholder="Tipp 1&#10;Tipp 2&#10;Tipp 3"
                      rows="5"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Brand-Farbe (optional)</label>
                    <input
                      type="color"
                      value={templateData.brandColor || '#10b981'}
                      onChange={(e) => setTemplateData({ ...templateData, brandColor: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 h-12"
                    />
                  </div>
                </div>
              )}

              {selectedTemplate === 'checklist' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Titel</label>
                    <input
                      type="text"
                      value={templateData.title || ''}
                      onChange={(e) => setTemplateData({ ...templateData, title: e.target.value })}
                      placeholder="z.B. Launch Checkliste"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Checkpunkte (einer pro Zeile, max. 6)</label>
                    <textarea
                      value={templateData.items?.join('\n') || ''}
                      onChange={(e) => setTemplateData({ ...templateData, items: e.target.value.split('\n').filter(item => item.trim()) })}
                      placeholder="Marketing-Material vorbereiten&#10;Landing Page prüfen&#10;Social Media Posts planen"
                      rows="6"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Brand-Farbe (optional)</label>
                    <input
                      type="color"
                      value={templateData.brandColor || '#f59e0b'}
                      onChange={(e) => setTemplateData({ ...templateData, brandColor: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 h-12"
                    />
                  </div>
                </div>
              )}

              {selectedTemplate === 'stats' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Titel</label>
                    <input
                      type="text"
                      value={templateData.title || ''}
                      onChange={(e) => setTemplateData({ ...templateData, title: e.target.value })}
                      placeholder="z.B. Q4 Ergebnisse 2024"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Statistiken (max. 4)</label>
                    {(templateData.stats || [{ value: '', label: '' }]).map((stat, index) => (
                      <div key={index} className="grid grid-cols-2 gap-3 mb-3">
                        <input
                          type="text"
                          value={stat.value}
                          onChange={(e) => {
                            const newStats = [...(templateData.stats || [])];
                            newStats[index] = { ...newStats[index], value: e.target.value };
                            setTemplateData({ ...templateData, stats: newStats });
                          }}
                          placeholder="Wert (z.B. 150%)"
                          className="w-full bg-gray-700 border border-gray-600 rounded p-2"
                        />
                        <input
                          type="text"
                          value={stat.label}
                          onChange={(e) => {
                            const newStats = [...(templateData.stats || [])];
                            newStats[index] = { ...newStats[index], label: e.target.value };
                            setTemplateData({ ...templateData, stats: newStats });
                          }}
                          placeholder="Label (z.B. Wachstum)"
                          className="w-full bg-gray-700 border border-gray-600 rounded p-2"
                        />
                      </div>
                    ))}
                    {(!templateData.stats || templateData.stats.length < 4) && (
                      <button
                        onClick={() => {
                          const newStats = [...(templateData.stats || []), { value: '', label: '' }];
                          setTemplateData({ ...templateData, stats: newStats });
                        }}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        + Statistik hinzufügen
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Brand-Farbe (optional)</label>
                    <input
                      type="color"
                      value={templateData.brandColor || '#8b5cf6'}
                      onChange={(e) => setTemplateData({ ...templateData, brandColor: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 h-12"
                    />
                  </div>
                </div>
              )}

              {selectedTemplate === 'text' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Titel</label>
                    <input
                      type="text"
                      value={templateData.title || ''}
                      onChange={(e) => setTemplateData({ ...templateData, title: e.target.value })}
                      placeholder="Haupttitel des Posts"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Text</label>
                    <textarea
                      value={templateData.body || ''}
                      onChange={(e) => setTemplateData({ ...templateData, body: e.target.value })}
                      placeholder="Der Haupttext des Posts..."
                      rows="4"
                      className="w-full bg-gray-700 border border-gray-600 rounded p-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Brand-Farbe (optional)</label>
                    <input
                      type="color"
                      value={templateData.brandColor || '#ef4444'}
                      onChange={(e) => setTemplateData({ ...templateData, brandColor: e.target.value })}
                      className="w-full bg-gray-700 border border-gray-600 rounded p-2 h-12"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3">
                <button
                  onClick={handlePreviewRender}
                  disabled={renderLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-2 px-4 rounded font-medium"
                >
                  {renderLoading ? 'Lädt...' : '👁️ Vorschau'}
                </button>
                <button
                  onClick={handleDownloadRender}
                  disabled={renderLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-2 px-4 rounded font-medium"
                >
                  {renderLoading ? 'Lädt...' : '⬇️ Download'}
                </button>
                <button
                  onClick={handleSaveRender}
                  disabled={renderLoading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 py-2 px-4 rounded font-medium"
                >
                  {renderLoading ? 'Lädt...' : '💾 Mediathek'}
                </button>
              </div>

              {/* Preview */}
              {previewImage && (
                <div>
                  <label className="block text-sm font-medium mb-2">Vorschau</label>
                  <div className="bg-gray-900 border border-gray-600 rounded p-4 text-center">
                    <img 
                      src={previewImage} 
                      alt="Template Preview" 
                      className="max-w-full max-h-96 mx-auto rounded"
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-between mt-6">
              <div>
                {activePostTab === 'basic' && editingPost && (
                  <button
                    onClick={handleDeletePost}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                  >
                    Löschen
                  </button>
                )}
                {activePostTab === 'graphics' && (
                  <button
                    onClick={resetGraphicsForm}
                    className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => {
                    setShowPostModal(false);
                    resetGraphicsForm();
                    setActivePostTab('basic');
                  }}
                  className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
                >
                  Schließen
                </button>
                {activePostTab === 'basic' && (
                  <button
                    onClick={handleSavePost}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                  >
                    Speichern
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Plan Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">🐢 Plan generieren</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Zeitraum</label>
                <div className="space-y-2">
                  {['diese Woche', 'nächste Woche', 'dieser Monat'].map(timeframe => (
                    <button
                      key={timeframe}
                      onClick={() => handleGeneratePlan(timeframe, selectedPlatform)}
                      disabled={loading}
                      className="w-full text-left p-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 rounded"
                    >
                      {timeframe}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}