import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ServerIcon,
  FilmIcon,
  ArrowPathIcon,
  RocketLaunchIcon,
  ForwardIcon,
} from '@heroicons/react/24/outline'
import api from '../lib/api'
import toast from 'react-hot-toast'
import type { ServiceConnection, ServiceConnectionCreate, ServiceType } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────
interface SetupStatus {
  setup_complete: boolean
  has_users: boolean
  has_arr_service: boolean
  has_media_server: boolean
  services: { id: number; name: string; service_type: string; is_enabled: boolean }[]
  current_step: string
}

interface TestResult {
  success: boolean
  version?: string
  message?: string
}

type WizardStep = 'welcome' | 'arr_services' | 'media_server' | 'sync' | 'complete'

const STEPS: WizardStep[] = ['welcome', 'arr_services', 'media_server', 'sync', 'complete']
const STEP_LABELS: Record<WizardStep, string> = {
  welcome: 'Welcome',
  arr_services: 'Download Managers',
  media_server: 'Media Server',
  sync: 'Initial Sync',
  complete: 'Complete',
}

// ─── Main Component ──────────────────────────────────────────────────────
export default function SetupWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')

  // Track services added during this wizard session
  const [addedServices, setAddedServices] = useState<ServiceConnection[]>([])

  // Fetch current setup status
  const { data: setupStatus, refetch: refetchStatus } = useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const res = await api.get<SetupStatus>('/setup/status')
      return res.data
    },
  })

  // Resume at the correct step if services already exist
  useEffect(() => {
    if (setupStatus) {
      if (setupStatus.setup_complete) {
        navigate('/', { replace: true })
        return
      }
      // Pre-populate added services
      if (setupStatus.services.length > 0 && addedServices.length === 0) {
        // Fetch full details of existing services
        api.get<ServiceConnection[]>('/services/').then((res) => {
          setAddedServices(res.data)
        })
      }
      // Resume at the right step
      if (setupStatus.has_arr_service && currentStep === 'welcome') {
        setCurrentStep(setupStatus.has_media_server ? 'sync' : 'media_server')
      }
    }
  }, [setupStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Complete setup mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/setup/complete')
      return res.data
    },
    onSuccess: () => {
      toast.success('Setup complete! Welcome to MediaCurator.')
      queryClient.invalidateQueries({ queryKey: ['setup-status'] })
      navigate('/', { replace: true })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to complete setup')
    },
  })

  // Skip setup mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/setup/skip')
      return res.data
    },
    onSuccess: () => {
      toast.success('Setup skipped. You can add services later from the Services page.')
      queryClient.invalidateQueries({ queryKey: ['setup-status'] })
      navigate('/', { replace: true })
    },
  })

  const goNext = () => {
    const idx = STEPS.indexOf(currentStep)
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1])
  }

  const goBack = () => {
    const idx = STEPS.indexOf(currentStep)
    if (idx > 0) setCurrentStep(STEPS[idx - 1])
  }

  const handleServiceAdded = (service: ServiceConnection) => {
    setAddedServices((prev) => [...prev, service])
    refetchStatus()
    queryClient.invalidateQueries({ queryKey: ['services'] })
  }

  const arrServices = addedServices.filter((s) =>
    ['sonarr', 'radarr'].includes(s.service_type)
  )
  const mediaServers = addedServices.filter((s) =>
    ['emby', 'jellyfin'].includes(s.service_type)
  )

  const stepIdx = STEPS.indexOf(currentStep)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-semibold text-lg text-gray-900 dark:text-white">MediaCurator Setup</span>
          </div>
          {currentStep !== 'complete' && (
            <button
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-dark-200 flex items-center gap-1 transition-colors"
            >
              <ForwardIcon className="w-4 h-4" />
              Skip Setup
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    i < stepIdx
                      ? 'bg-primary-600 text-white'
                      : i === stepIdx
                        ? 'bg-primary-500 text-white ring-4 ring-primary-500/20'
                        : 'bg-gray-200 dark:bg-dark-700 text-gray-500 dark:text-dark-400'
                  }`}
                >
                  {i < stepIdx ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs hidden sm:inline ${
                    i <= stepIdx ? 'text-gray-700 dark:text-dark-200 font-medium' : 'text-gray-400 dark:text-dark-500'
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-8 sm:w-16 h-0.5 mx-1 ${
                      i < stepIdx ? 'bg-primary-500' : 'bg-gray-200 dark:bg-dark-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-2xl">
          {currentStep === 'welcome' && (
            <WelcomeStep onNext={goNext} />
          )}
          {currentStep === 'arr_services' && (
            <ArrServicesStep
              services={arrServices}
              onServiceAdded={handleServiceAdded}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 'media_server' && (
            <MediaServerStep
              services={mediaServers}
              onServiceAdded={handleServiceAdded}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 'sync' && (
            <SyncStep
              services={addedServices}
              onNext={() => completeMutation.mutate()}
              onBack={goBack}
              isCompleting={completeMutation.isPending}
            />
          )}
          {currentStep === 'complete' && (
            <CompleteStep onFinish={() => navigate('/', { replace: true })} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Welcome Step ────────────────────────────────────────────────────────
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div>
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-600 rounded-2xl mb-6">
          <RocketLaunchIcon className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Welcome to MediaCurator
        </h2>
        <p className="text-gray-500 dark:text-dark-400 max-w-lg mx-auto text-lg">
          Let's get your media management set up. This wizard will guide you through
          connecting your services in the right order.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-5">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-3">
            <ServerIcon className="w-5 h-5 text-blue-500" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">1. Download Managers</h3>
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Connect Sonarr and/or Radarr to track your media library.
          </p>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-5">
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center mb-3">
            <FilmIcon className="w-5 h-5 text-purple-500" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">2. Media Server</h3>
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Connect Emby or Jellyfin for watch history and library data.
          </p>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-5">
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center mb-3">
            <ArrowPathIcon className="w-5 h-5 text-green-500" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">3. Sync & Verify</h3>
          <p className="text-xs text-gray-500 dark:text-dark-400">
            Run an initial sync and verify everything is working.
          </p>
        </div>
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      >
        Get Started
        <ArrowRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Service Form (Reusable) ─────────────────────────────────────────────
function ServiceForm({
  allowedTypes,
  onServiceAdded,
}: {
  allowedTypes: { value: ServiceType; label: string; placeholder: string }[]
  onServiceAdded: (service: ServiceConnection) => void
}) {
  const [formData, setFormData] = useState<ServiceConnectionCreate>({
    name: '',
    service_type: allowedTypes[0].value,
    url: '',
    api_key: '',
    is_enabled: true,
    verify_ssl: true,
    timeout: 120,
  })
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const selectedType = allowedTypes.find((t) => t.value === formData.service_type)

  const testMutation = useMutation({
    mutationFn: async () => {
      setIsTesting(true)
      const res = await api.post<TestResult>('/setup/test-connection', {
        service_type: formData.service_type,
        url: formData.url,
        api_key: formData.api_key,
        verify_ssl: formData.verify_ssl,
        timeout: formData.timeout,
      })
      return res.data
    },
    onSuccess: (data) => {
      setTestResult(data)
      if (data.success) {
        toast.success(`Connection successful! Version: ${data.version}`)
      } else {
        toast.error(`Connection failed: ${data.message}`)
      }
    },
    onError: () => {
      setTestResult({ success: false, message: 'Connection test failed' })
      toast.error('Connection test failed')
    },
    onSettled: () => setIsTesting(false),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<ServiceConnection>('/setup/add-service', formData)
      return res.data
    },
    onSuccess: (service) => {
      toast.success(`${service.name} added successfully!`)
      onServiceAdded(service)
      // Reset form for adding another
      setFormData({
        name: '',
        service_type: allowedTypes[0].value,
        url: '',
        api_key: '',
        is_enabled: true,
        verify_ssl: true,
        timeout: 120,
      })
      setTestResult(null)
    },
    onError: () => toast.error('Failed to add service'),
  })

  const canTest = formData.url.trim() !== '' && formData.api_key.trim() !== ''
  const canSave = canTest && formData.name.trim() !== '' && testResult?.success

  return (
    <div className="space-y-4">
      {/* Service Type */}
      {allowedTypes.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">
            Service Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {allowedTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, service_type: type.value })
                  setTestResult(null)
                }}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                  formData.service_type === type.value
                    ? 'bg-primary-500/10 border-primary-500 text-primary-400'
                    : 'bg-white dark:bg-dark-700 border-gray-300 dark:border-dark-600 text-gray-700 dark:text-dark-300 hover:border-gray-400 dark:hover:border-dark-500'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">Name</label>
        <input
          type="text"
          className="block w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={`My ${selectedType?.label || 'Service'}`}
        />
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">URL</label>
        <input
          type="url"
          className="block w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          value={formData.url}
          onChange={(e) => {
            setFormData({ ...formData, url: e.target.value })
            setTestResult(null)
          }}
          placeholder={selectedType?.placeholder || 'http://localhost:8096'}
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">API Key</label>
        <input
          type="password"
          className="block w-full px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-dark-100 placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          value={formData.api_key}
          onChange={(e) => {
            setFormData({ ...formData, api_key: e.target.value })
            setTestResult(null)
          }}
          placeholder="Enter API key"
        />
      </div>

      {/* Advanced Settings */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-dark-200 transition-colors"
        >
          {showAdvanced ? '▾ Hide advanced settings' : '▸ Advanced settings'}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3 p-3 bg-gray-50 dark:bg-dark-700/50 rounded-lg">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.verify_ssl}
                onChange={(e) => setFormData({ ...formData, verify_ssl: e.target.checked })}
                className="rounded border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-dark-200">Verify SSL</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-200 mb-1">
                Timeout (seconds)
              </label>
              <input
                type="number"
                min={5}
                max={600}
                className="block w-32 px-3 py-2 bg-white dark:bg-dark-700 border border-gray-300 dark:border-dark-600 rounded-lg text-gray-900 dark:text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={formData.timeout}
                onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 120 })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`p-3 rounded-lg border flex items-center gap-2 text-sm ${
            testResult.success
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {testResult.success ? (
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
          ) : (
            <XCircleIcon className="w-5 h-5 shrink-0" />
          )}
          {testResult.success
            ? `Connected! Version: ${testResult.version}`
            : `Failed: ${testResult.message}`}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => testMutation.mutate()}
          disabled={!canTest || isTesting}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-dark-200 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTesting ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircleIcon className="w-4 h-4" />
          )}
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveMutation.isPending ? 'Adding...' : 'Add Service'}
        </button>
      </div>
    </div>
  )
}

// ─── Added Service Card ──────────────────────────────────────────────────
function AddedServiceCard({ service }: { service: ServiceConnection }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
      <CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {service.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-dark-400">
          {service.service_type.toUpperCase()} &bull; {service.url}
        </p>
      </div>
    </div>
  )
}

// ─── Arr Services Step ───────────────────────────────────────────────────
function ArrServicesStep({
  services,
  onServiceAdded,
  onNext,
  onBack,
}: {
  services: ServiceConnection[]
  onServiceAdded: (service: ServiceConnection) => void
  onNext: () => void
  onBack: () => void
}) {
  const arrTypes: { value: ServiceType; label: string; placeholder: string }[] = [
    { value: 'sonarr', label: 'Sonarr (TV Shows)', placeholder: 'http://localhost:8989' },
    { value: 'radarr', label: 'Radarr (Movies)', placeholder: 'http://localhost:7878' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <ServerIcon className="w-5 h-5 text-blue-500" />
          </div>
          Connect Download Managers
        </h2>
        <p className="text-gray-500 dark:text-dark-400 mt-2">
          Add at least one Sonarr or Radarr instance. These services manage your media downloads
          and provide the library data MediaCurator needs.
        </p>
      </div>

      {/* Already added */}
      {services.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-dark-300">Added Services</h3>
          {services.map((s) => (
            <AddedServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}

      {/* Add form */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-dark-300 mb-4">
          {services.length > 0 ? 'Add Another Service' : 'Add Service'}
        </h3>
        <ServiceForm allowedTypes={arrTypes} onServiceAdded={onServiceAdded} />
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={services.length === 0}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Media Server Step ───────────────────────────────────────────────────
function MediaServerStep({
  services,
  onServiceAdded,
  onNext,
  onBack,
}: {
  services: ServiceConnection[]
  onServiceAdded: (service: ServiceConnection) => void
  onNext: () => void
  onBack: () => void
}) {
  const mediaTypes: { value: ServiceType; label: string; placeholder: string }[] = [
    { value: 'emby', label: 'Emby', placeholder: 'http://localhost:8096' },
    { value: 'jellyfin', label: 'Jellyfin', placeholder: 'http://localhost:8096' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
            <FilmIcon className="w-5 h-5 text-purple-500" />
          </div>
          Connect Media Server
        </h2>
        <p className="text-gray-500 dark:text-dark-400 mt-2">
          Add your Emby or Jellyfin media server. This provides watch history, user data,
          and library information for intelligent cleanup decisions.
        </p>
      </div>

      {/* Already added */}
      {services.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-dark-300">Added Servers</h3>
          {services.map((s) => (
            <AddedServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}

      {/* Add form */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 p-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-dark-300 mb-4">
          {services.length > 0 ? 'Add Another Server' : 'Add Media Server'}
        </h3>
        <ServiceForm allowedTypes={mediaTypes} onServiceAdded={onServiceAdded} />
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={services.length === 0}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Sync Step ───────────────────────────────────────────────────────────
function SyncStep({
  services,
  onNext,
  onBack,
  isCompleting,
}: {
  services: ServiceConnection[]
  onNext: () => void
  onBack: () => void
  isCompleting: boolean
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<Record<number, { status: 'pending' | 'syncing' | 'success' | 'error'; message?: string }>>({})

  const runSync = async () => {
    setSyncing(true)
    const results: typeof syncResults = {}

    // Initialize all as pending
    for (const svc of services) {
      results[svc.id] = { status: 'pending' }
    }
    setSyncResults({ ...results })

    // Sync each service sequentially
    for (const svc of services) {
      results[svc.id] = { status: 'syncing' }
      setSyncResults({ ...results })

      try {
        const res = await api.post(`/services/${svc.id}/sync`)
        const data = res.data
        const added = data.added || 0
        const updated = data.updated || 0
        const users = data.users_synced || 0
        let msg = `${added} added, ${updated} updated`
        if (users > 0) msg += `, ${users} users synced`
        results[svc.id] = { status: 'success', message: msg }
      } catch (err: any) {
        results[svc.id] = {
          status: 'error',
          message: err?.response?.data?.detail || err?.message || 'Sync failed',
        }
      }
      setSyncResults({ ...results })
    }
    setSyncing(false)
  }

  const allSynced = services.every((s) => syncResults[s.id]?.status === 'success')
  const anySynced = services.some((s) => syncResults[s.id]?.status === 'success')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
            <ArrowPathIcon className="w-5 h-5 text-green-500" />
          </div>
          Initial Sync
        </h2>
        <p className="text-gray-500 dark:text-dark-400 mt-2">
          Run an initial synchronization to import your media libraries and watch history.
          This may take a few minutes depending on library size.
        </p>
      </div>

      {/* Service sync cards */}
      <div className="space-y-3">
        {services.map((svc) => {
          const result = syncResults[svc.id]
          return (
            <div
              key={svc.id}
              className={`bg-white dark:bg-dark-800 rounded-xl border p-4 flex items-center gap-4 transition-colors ${
                result?.status === 'success'
                  ? 'border-green-500/30'
                  : result?.status === 'error'
                    ? 'border-red-500/30'
                    : result?.status === 'syncing'
                      ? 'border-primary-500/30'
                      : 'border-gray-200 dark:border-dark-700'
              }`}
            >
              <div className="shrink-0">
                {result?.status === 'success' ? (
                  <CheckCircleIcon className="w-6 h-6 text-green-400" />
                ) : result?.status === 'error' ? (
                  <XCircleIcon className="w-6 h-6 text-red-400" />
                ) : result?.status === 'syncing' ? (
                  <ArrowPathIcon className="w-6 h-6 text-primary-400 animate-spin" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-dark-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {svc.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  {svc.service_type.toUpperCase()}
                  {result?.message && ` — ${result.message}`}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Run Sync button */}
      {!allSynced && (
        <button
          onClick={runSync}
          disabled={syncing}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <ArrowPathIcon className="w-4 h-4" />
              {Object.keys(syncResults).length > 0 ? 'Retry Sync' : 'Run Initial Sync'}
            </>
          )}
        </button>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-200 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!anySynced || isCompleting}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCompleting ? 'Finishing...' : 'Complete Setup'}
          <CheckCircleIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Complete Step ───────────────────────────────────────────────────────
function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center space-y-6 py-8">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full">
        <CheckCircleIcon className="w-12 h-12 text-green-400" />
      </div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
      <p className="text-gray-500 dark:text-dark-400 max-w-md mx-auto">
        Your services are connected and initial sync is complete. Next, head to the
        <strong className="text-gray-700 dark:text-dark-200"> Rules</strong> page to configure
        your cleanup policies.
      </p>
      <button
        onClick={onFinish}
        className="inline-flex items-center gap-2 px-8 py-3 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
      >
        Go to Dashboard
        <ArrowRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
