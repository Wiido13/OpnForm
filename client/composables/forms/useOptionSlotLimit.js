import { ref, computed, toValue } from 'vue'
import { opnFetch } from '~/composables/useOpnApi.js'

/**
 * Composable to manage option slot limits for select/multi_select fields.
 * Fetches submission counts from the backend and provides reactive state
 * for disabling, styling, and labeling sold-out options.
 */
export function useOptionSlotLimit(formConfigRef) {
  const optionCountsData = ref({})
  const isLoading = ref(false)
  const hasFetched = ref(false)

  /**
   * Check if any field in the form has option_slot_limit enabled.
   */
  const hasSlotLimitFields = computed(() => {
    const config = toValue(formConfigRef)
    if (!config?.properties) return false

    return config.properties.some((prop) => {
      if (!['select', 'multi_select'].includes(prop.type)) return false
      const slotLimit = prop.logic?.option_slot_limit
      return slotLimit?.enabled && slotLimit?.max_slots > 0
    })
  })

  /**
   * Fetch option counts from the API.
   */
  async function fetchOptionCounts() {
    const config = toValue(formConfigRef)
    if (!config?.id || !hasSlotLimitFields.value) return

    if (isLoading.value) return

    isLoading.value = true
    try {
      const slug = config.slug || config.id
      const data = await opnFetch(`/forms/${slug}/option-counts`)
      optionCountsData.value = data || {}
      hasFetched.value = true
    } catch (error) {
      console.error('[useOptionSlotLimit] Failed to fetch option counts:', error)
      optionCountsData.value = {}
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get the slot limit configuration for a specific field.
   */
  function getFieldSlotLimit(field) {
    if (!field || !['select', 'multi_select'].includes(field.type)) return null
    const slotLimit = field.logic?.option_slot_limit
    if (!slotLimit?.enabled || !slotLimit?.max_slots) return null
    return slotLimit
  }

  /**
   * Get sold-out option names for a specific field.
   * Returns an array of option values that have reached their slot limit.
   */
  function getSoldOutOptions(field) {
    const slotLimit = getFieldSlotLimit(field)
    if (!slotLimit) return []

    const fieldData = optionCountsData.value[field.id]
    if (!fieldData) return []

    const counts = fieldData.counts || {}
    const maxSlots = slotLimit.max_slots

    return Object.entries(counts)
      .filter(([, count]) => count >= maxSlots)
      .map(([optionName]) => optionName)
  }

  /**
   * Get the sold-out text configured for a field.
   */
  function getSoldOutText(field) {
    const slotLimit = getFieldSlotLimit(field)
    if (!slotLimit) return ''
    return slotLimit.sold_out_text || 'Sold out'
  }

  /**
   * Check whether strikethrough should be applied for a field.
   */
  function shouldStrikethrough(field) {
    const slotLimit = getFieldSlotLimit(field)
    if (!slotLimit) return false
    return slotLimit.strikethrough !== false // defaults to true
  }

  /**
   * Check whether options should be disabled for a field.
   */
  function shouldDisableOptions(field) {
    const slotLimit = getFieldSlotLimit(field)
    if (!slotLimit) return false
    return slotLimit.disable_option !== false // defaults to true
  }

  /**
   * Process options for a field, enriching them with sold-out state.
   * Returns processed options with soldOut flag and modified display name.
   */
  function processOptions(field, options) {
    const slotLimit = getFieldSlotLimit(field)
    if (!slotLimit || !hasFetched.value) return { options, disabledOptions: [], soldOutMap: {} }

    const soldOutOptions = getSoldOutOptions(field)
    const soldOutText = getSoldOutText(field)
    const strikethrough = shouldStrikethrough(field)
    const disableOption = shouldDisableOptions(field)

    const disabledOptions = disableOption
      ? soldOutOptions
      : []

    const soldOutMap = {}
    for (const optName of soldOutOptions) {
      soldOutMap[optName] = {
        soldOutText,
        strikethrough,
        disabled: disableOption,
      }
    }

    return {
      options,
      disabledOptions,
      soldOutMap,
    }
  }

  return {
    optionCountsData,
    isLoading,
    hasFetched,
    hasSlotLimitFields,
    fetchOptionCounts,
    getFieldSlotLimit,
    getSoldOutOptions,
    getSoldOutText,
    shouldStrikethrough,
    shouldDisableOptions,
    processOptions,
  }
}
