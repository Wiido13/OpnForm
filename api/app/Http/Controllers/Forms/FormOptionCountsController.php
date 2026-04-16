<?php

namespace App\Http\Controllers\Forms;

use App\Http\Controllers\Controller;
use App\Models\Forms\Form;
use App\Models\Forms\FormSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FormOptionCountsController extends Controller
{
    /**
     * Returns submission counts per option value for fields that have option_slot_limit configured.
     * This endpoint is public (no auth required) since it's used when rendering public forms.
     *
     * @param  Request  $request
     * @param  Form  $form
     * @return \Illuminate\Http\JsonResponse
     */
    public function __invoke(Request $request, Form $form)
    {
        // Ensure form is public or closed
        if (!in_array($form->visibility, ['public', 'closed'])) {
            abort(404);
        }

        // Find all select/multi_select fields that have option_slot_limit enabled
        $properties = $form->properties ?? [];
        $fieldsWithSlotLimit = [];

        foreach ($properties as $property) {
            if (!in_array($property['type'] ?? '', ['select', 'multi_select'])) {
                continue;
            }

            $logic = $property['logic'] ?? null;
            if (!$logic || !is_array($logic)) {
                continue;
            }

            $slotLimit = $logic['option_slot_limit'] ?? null;
            if (!$slotLimit || !($slotLimit['enabled'] ?? false)) {
                continue;
            }

            $fieldsWithSlotLimit[] = [
                'id' => $property['id'],
                'type' => $property['type'],
                'max_slots' => (int) ($slotLimit['max_slots'] ?? 0),
            ];
        }

        if (empty($fieldsWithSlotLimit)) {
            return response()->json([]);
        }

        $result = [];
        $dbConnection = DB::connection()->getDriverName();

        foreach ($fieldsWithSlotLimit as $field) {
            $fieldId = $field['id'];

            // Validate field ID format to prevent SQL injection
            if (!preg_match('/^[a-zA-Z0-9_-]+$/', $fieldId)) {
                continue;
            }

            $counts = $this->getOptionCounts($form, $fieldId, $dbConnection);

            $result[$fieldId] = [
                'counts' => $counts,
                'max_slots' => $field['max_slots'],
            ];
        }

        return response()->json($result);
    }

    /**
     * Get submission counts per option value for a specific field.
     */
    private function getOptionCounts(Form $form, string $fieldId, string $dbConnection): array
    {
        $submissions = $form->submissions()
            ->where('status', '!=', FormSubmission::STATUS_PARTIAL)
            ->get(['data']);

        $counts = [];

        foreach ($submissions as $submission) {
            $data = $submission->data;
            if (!isset($data[$fieldId])) {
                continue;
            }

            $value = $data[$fieldId];

            if (is_array($value)) {
                // Multi-select: count each selected option
                foreach ($value as $optionValue) {
                    if (is_string($optionValue) || is_numeric($optionValue)) {
                        $key = (string) $optionValue;
                        $counts[$key] = ($counts[$key] ?? 0) + 1;
                    }
                }
            } elseif (is_string($value) || is_numeric($value)) {
                // Single select
                $key = (string) $value;
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }

        return $counts;
    }
}
