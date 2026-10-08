import 'package:flutter/material.dart';

import '../core/models.dart';
import '../theme.dart';

const Map<String, String> projectStatusLabels = {
  'PLANNING': 'Planning',
  'ACTIVE': 'Active',
  'COMPLETED': 'Completed',
  'ARCHIVED': 'Archived',
};

/// Create or edit a project with the same fields as the web form. Returns the
/// request body for POST /projects or PATCH /projects/:id.
class ProjectFormSheet extends StatefulWidget {
  const ProjectFormSheet({super.key, this.project});

  final ProjectSummary? project;

  @override
  State<ProjectFormSheet> createState() => _ProjectFormSheetState();
}

class _ProjectFormSheetState extends State<ProjectFormSheet> {
  late final _name = TextEditingController(text: widget.project?.name ?? '');
  late final _description = TextEditingController(text: widget.project?.description ?? '');
  late final _location = TextEditingController(text: widget.project?.location ?? '');
  late final _category = TextEditingController(text: widget.project?.category ?? '');
  late String _status = widget.project?.status ?? 'PLANNING';
  late DateTime _start = widget.project?.startDate ?? DateTime.now();
  late DateTime? _end = widget.project?.endDate;

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _location.dispose();
    _category.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().length >= 2 && (_end == null || !_end!.isBefore(_start));

  Future<void> _pickDate({required bool start}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: start ? _start : (_end ?? _start),
      firstDate: DateTime(2015),
      lastDate: DateTime(2040),
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _start = picked;
      } else {
        _end = picked;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.project != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(editing ? 'Edit project' : 'New project', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 4),
          const Text('The project period is part of every capture-time check: photos dated outside it are flagged.', style: TextStyle(color: Brand.stone, fontSize: 13)),
          const SizedBox(height: 16),
          TextField(controller: _name, autofocus: !editing, maxLength: 120, textCapitalization: TextCapitalization.sentences, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Name', hintText: 'Plot B plantation drive')),
          TextField(controller: _category, maxLength: 80, decoration: const InputDecoration(labelText: 'Category (optional)', hintText: 'Plantation, Water, Education')),
          TextField(controller: _location, maxLength: 160, decoration: const InputDecoration(labelText: 'Location (optional)', hintText: 'Bassi, Rajasthan')),
          TextField(controller: _description, maxLength: 2000, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            value: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: [for (final entry in projectStatusLabels.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
            onChanged: (value) => setState(() => _status = value ?? _status),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _DateButton(label: 'Starts', value: formatDay(_start), onTap: () => _pickDate(start: true))),
            const SizedBox(width: 10),
            Expanded(child: _DateButton(label: 'Ends', value: _end == null ? 'Open' : formatDay(_end!), onTap: () => _pickDate(start: false), onClear: _end == null ? null : () => setState(() => _end = null))),
          ]),
          if (_end != null && _end!.isBefore(_start)) const Padding(padding: EdgeInsets.only(top: 6), child: Text('End date cannot be before start date', style: TextStyle(color: Color(0xFFB91C1C), fontSize: 12))),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: !_valid
                ? null
                : () => Navigator.pop(context, <String, Object?>{
                      'name': _name.text.trim(),
                      'description': _description.text.trim().isEmpty ? null : _description.text.trim(),
                      'location': _location.text.trim().isEmpty ? null : _location.text.trim(),
                      'category': _category.text.trim().isEmpty ? null : _category.text.trim(),
                      'status': _status,
                      'startDate': DateTime(_start.year, _start.month, _start.day).toUtc().toIso8601String(),
                      'endDate': _end == null ? null : DateTime(_end!.year, _end!.month, _end!.day, 23, 59).toUtc().toIso8601String(),
                    }),
            child: Text(editing ? 'Save changes' : 'Create project'),
          ),
        ]),
      ),
    );
  }
}

class _DateButton extends StatelessWidget {
  const _DateButton({required this.label, required this.value, required this.onTap, this.onClear});

  final String label;
  final String value;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(fontSize: 11, color: Brand.stone)),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
          ),
          if (onClear != null) IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.close, size: 16), onPressed: onClear) else const Icon(Icons.calendar_today_outlined, size: 16, color: Brand.stone),
        ]),
      ),
    );
  }
}
