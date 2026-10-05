import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// An API failure. [network] is true when the request never reached the
/// server (offline, DNS, timeout), which the capture queue retries later.
class ApiException implements Exception {
  const ApiException(this.status, this.message, {this.code, this.network = false});

  final int status;
  final String message;
  final String? code;
  final bool network;

  /// Worth retrying later: no connection, server trouble, rate limiting, or an
  /// expired session (the capture waits until the person signs in again).
  bool get retryable => network || status >= 500 || status == 429 || status == 401;

  @override
  String toString() => message;
}

/// Thin JSON client for the FieldProof API: bearer token and active
/// organization on every request, server error messages surfaced as-is.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? client}) : _http = client ?? http.Client();

  final String baseUrl;
  final http.Client _http;
  String? token;
  String? organizationId;

  Map<String, String> _headers({bool json = true}) => {
        if (json) 'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        if (organizationId != null) 'X-Organization-Id': organizationId!,
      };

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<Map<String, dynamic>> get(String path) =>
      _send(() => _http.get(_uri(path), headers: _headers()), const Duration(seconds: 20));

  Future<Map<String, dynamic>> post(String path, [Map<String, Object?> body = const {}]) =>
      _send(() => _http.post(_uri(path), headers: _headers(), body: jsonEncode(body)), const Duration(seconds: 30));

  /// One file plus text fields, as the live-capture endpoint expects.
  Future<Map<String, dynamic>> postFile(
    String path, {
    required Map<String, String> fields,
    required List<int> bytes,
    required String filename,
  }) {
    return _send(() async {
      final request = http.MultipartRequest('POST', _uri(path))
        ..headers.addAll(_headers(json: false))
        ..fields.addAll(fields)
        ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename, contentType: MediaType('image', 'jpeg')));
      return http.Response.fromStream(await _http.send(request));
    }, const Duration(minutes: 2));
  }

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() call, Duration timeout) async {
    final http.Response response;
    try {
      response = await call().timeout(timeout);
    } on SocketException {
      throw const ApiException(0, 'No connection to FieldProof', network: true);
    } on TimeoutException {
      throw const ApiException(0, 'FieldProof took too long to answer', network: true);
    } on http.ClientException {
      throw const ApiException(0, 'No connection to FieldProof', network: true);
    }
    if (response.statusCode == 204) return <String, dynamic>{};
    Map<String, dynamic> body;
    try {
      body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    } on FormatException {
      body = <String, dynamic>{};
    }
    if (response.statusCode >= 200 && response.statusCode < 300) return body;
    final error = body['error'] is Map<String, dynamic> ? body['error'] as Map<String, dynamic> : const <String, dynamic>{};
    throw ApiException(
      response.statusCode,
      (error['message'] as String?) ?? 'Request failed (${response.statusCode})',
      code: error['code'] as String?,
    );
  }
}
