import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// "Ask FieldProof": answers come from this organization's own numbers via
/// the backend; the assistant cannot change anything.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final List<({String role, String content})> _messages = [];
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _busy = false;

  static const _starters = ['What is waiting for review?', 'How are our targets going?', 'Which photos need a second look, and why?'];

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    final content = text.trim();
    if (content.isEmpty || _busy) return;
    final state = AppScope.of(context);
    setState(() {
      _messages.add((role: 'user', content: content));
      _input.clear();
      _busy = true;
    });
    try {
      final reply = await state.workspace.ask(_messages.length > 10 ? _messages.sublist(_messages.length - 10) : _messages);
      if (mounted) setState(() => _messages.add((role: 'assistant', content: reply)));
    } on ApiException catch (error) {
      if (mounted) setState(() => _messages.add((role: 'assistant', content: 'I could not answer right now (${error.message}).')));
    } finally {
      if (mounted) setState(() => _busy = false);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (mounted && _scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final org = AppScope.of(context).membership?.organization.name ?? 'your organization';
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Ask FieldProof', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Text("Answers from $org's own numbers", style: const TextStyle(fontSize: 12, color: Brand.stone)),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.all(16),
            children: [
              if (_messages.isEmpty) ...[
                const Text('Ask about projects, evidence, the review queue or targets. Only this organization\'s data is used.', style: TextStyle(color: Brand.stone)),
                const SizedBox(height: 10),
                for (final starter in _starters)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton(onPressed: () => _send(starter), style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, backgroundColor: Colors.white), child: Text(starter)),
                  ),
              ],
              for (final message in _messages)
                Align(
                  alignment: message.role == 'user' ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
                    decoration: BoxDecoration(color: message.role == 'user' ? Brand.ink : Colors.white, borderRadius: BorderRadius.circular(18)),
                    child: Text(message.content, style: TextStyle(color: message.role == 'user' ? Colors.white : Brand.ink, height: 1.4)),
                  ),
                ),
              if (_busy) const Padding(padding: EdgeInsets.all(8), child: Row(children: [SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)), SizedBox(width: 8), Text('Looking at your data…', style: TextStyle(color: Brand.stone, fontSize: 12))])),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(children: [
              Expanded(child: TextField(controller: _input, maxLength: 2000, buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null, onSubmitted: _send, decoration: const InputDecoration(hintText: 'Ask about your evidence…'))),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _busy ? null : () => _send(_input.text), icon: const Icon(Icons.send), style: IconButton.styleFrom(backgroundColor: Brand.ink, foregroundColor: Brand.lime)),
            ]),
          ),
        ),
      ]),
    );
  }
}
