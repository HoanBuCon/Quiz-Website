# Testing Guide - Document Storage System

## 📋 Pre-Test Checklist

- [ ] Database migration executed
- [ ] Backend server restarted
- [ ] Frontend dev server running
- [ ] Logged in as a user

---

## 🧪 Test Plan

### Test 1: Backend Folder Creation

**Purpose**: Verify folders are created automatically

**Steps**:
1. Check backend logs for: `[INFO] Documents directory ensured`
2. Verify folder exists:
   ```bash
   ls -la quiz-backend/public/documents
   ```

**Expected**: Folder exists and is writable

---

### Test 2: File Upload via CreateClassPage

**Purpose**: Test end-to-end upload from CreateClassPage

**Steps**:
1. Navigate to `http://localhost:3000/create-class`
2. Fill in class info:
   - Name: "Test Class"
   - Description: "Testing document storage"
3. Prepare a test `.docx` file with quiz questions
4. Upload the file

**Check Console Logs**:
```
handleFiles called with files: [File]
Uploading file to server...
File uploaded to server: {id: "...", filePath: "files/documents/2024/12/..."}
Parsing file locally...
Parse result: {success: true, questions: [...]}
Navigating to edit-quiz with uploadedFileId: ...
```

**Check Backend Logs**:
```
POST /documents/upload 201 ... ms
```

**Check Filesystem**:
```bash
ls -la quiz-backend/public/documents/2024/12/
```

**Expected**:
- ✅ File appears in folder with CUID name
- ✅ Navigate to EditQuizPage
- ✅ Questions displayed correctly
- ✅ Console shows `uploadedFileId`

---

### Test 3: File Upload via DocumentsPage

**Purpose**: Test upload from DocumentsPage

**Steps**:
1. Navigate to `http://localhost:3000/documents`
2. Upload a `.docx` file
3. Wait for upload to complete

**Check**:
- ✅ File appears in documents list
- ✅ Shows upload date
- ✅ No errors in console

**Check Database**:
```sql
SELECT id, name, filePath, content FROM UploadedFile ORDER BY uploadedAt DESC LIMIT 1;
```

**Expected**:
- `filePath`: `files/documents/2024/12/....docx`
- `content`: `NULL` (not stored)

---

### Test 4: Create Quiz from Uploaded Document

**Purpose**: Test creating quiz from stored file

**Steps**:
1. On DocumentsPage, click a file
2. Click "Tạo lớp từ file"  
3. Fill in class info in modal
4. Click submit

**Check Console**:
```
Downloading file from: http://localhost:4000/files/documents/2024/12/...
Parse result: {success: true, questions: [...]}
Navigating to edit-quiz with uploadedFileId: ...
```

**Expected**:
- ✅ File downloaded from server
- ✅ Questions parsed correctly
- ✅ Navigate to EditQuizPage
- ✅ All questions displayed

---

### Test 5: File Deletion

**Purpose**: Verify both DB and file are deleted

**Steps**:
1. Note a file ID and path from database
2. On DocumentsPage, click trash icon
3. Confirm deletion

**Check Database**:
```sql
SELECT * FROM UploadedFile WHERE id = 'the_file_id';
```

**Check Filesystem**:
```bash
ls quiz-backend/public/documents/2024/12/the_file_name.docx
```

**Expected**:
- ✅ Record removed from database
- ✅ File removed from filesystem
- ✅ Success alert shown

---

### Test 6: Backward Compatibility (Legacy Files)

**Purpose**: Test that old files (with content) still work

**Steps**:
1. Manually insert a legacy file:
   ```sql
   INSERT INTO UploadedFile (id, name, type, size, content, uploadedAt, userId)
   VALUES (
     'legacy-test-123',
     'legacy-file.txt',
     'txt',
     100,
     'Câu 1: Test question\nA. Answer A\n*B. Answer B',
     NOW(),
     'your_user_id'
   );
   ```

2. Reload DocumentsPage
3. Click on legacy file → "Tạo lớp từ file"

**Check Console**:
```
fileData.content exists (legacy file)
Creating File from content...
Parse result: {success: true, ...}
```

**Expected**:
- ✅ Legacy file appears in list
- ✅ Can create quiz from it
- ✅ Questions parsed correctly
- ✅ No errors

---

### Test 7: Duplicate File Handling

**Purpose**: Test overwrite functionality

**Steps**:
1. Upload `test.docx`
2. Upload `test.docx` again (same name)
3. Choose "Overwrite" in modal

**Expected**:
- ✅ Old file deleted
- ✅ New file uploaded
- ✅ Only one `test.docx` in list
- ✅ Old physical file removed

---

### Test 8: Static File Serving

**Purpose**: Verify files are accessible via URL

**Steps**:
1. Upload a file, note its `filePath` from database
2. Access: `http://localhost:4000/files/documents/2024/12/filename.docx`

**Expected**:
- ✅ File downloads
- ✅ Correct content-type header
- ✅ CORS headers present

---

### Test 9: Large File Upload

**Purpose**: Test 10MB limit

**Steps**:
1. Create a 5MB file (should work)
2. Upload successfully
3. Create a 15MB file (should fail)
4. Attempt upload

**Expected**:
- ✅ 5MB: Upload successful
- ✅ 15MB: Error "File too large"

---

### Test 10: API Endpoints (curl)

**Purpose**: Test raw API

**Get Token**:
```bash
# Login first, copy token from localStorage
TOKEN="your_jwt_token_here"
```

**Test Upload**:
```bash
curl -X POST http://localhost:4000/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.docx"
```

**Test List**:
```bash
curl http://localhost:4000/documents \
  -H "Authorization: Bearer $TOKEN"
```

**Test Get**:
```bash
curl http://localhost:4000/documents/FILE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Test Delete**:
```bash
curl -X DELETE http://localhost:4000/documents/FILE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected**: All return appropriate JSON responses

---

## 🐛 Common Issues & Fixes

### Issue: "Cannot find module 'multer'"

**Fix**:
```bash
cd quiz-backend
npm install multer
```

### Issue: "ENOENT: no such file or directory"

**Fix**: Backend hasn't created folders yet. Restart server:
```bash
npm run dev
```

### Issue: "413 Payload Too Large"

**Fix**: File exceeds 10MB limit. This is expected behavior.

### Issue: Database error "Unknown column 'filePath'"

**Fix**: Migration not run. Execute:
```bash
mysql -u fmdowfmw_hoanbucon -p fmdowfmw_quiz_app < migrations/add-document-storage.sql
```

### Issue: "Failed to fetch" when downloading file

**Fix**: Check static file serving path in `index.js`. Should be `/files/documents`, not `/documents`.

---

## ✅ Success Criteria

All tests pass if:
- [x] Files upload successfully
- [x] Files stored in correct folders
- [x] Database has `filePath`, `content` is NULL
- [x] Files downloadable via URL
- [x] Quiz creation works from uploaded files
- [x] Deletion removes both DB record and file
- [x] Legacy files still work
- [x] No console errors

---

## 📊 Test Results Template

```
Test Date: ___________
Tester: ___________

Test 1 (Folder Creation): ☐ Pass ☐ Fail
Test 2 (CreateClass Upload): ☐ Pass ☐ Fail
Test 3 (Documents Upload): ☐ Pass ☐ Fail
Test 4 (Create Quiz): ☐ Pass ☐ Fail
Test 5 (Deletion): ☐ Pass ☐ Fail
Test 6 (Legacy Files): ☐ Pass ☐ Fail
Test 7 (Duplicates): ☐ Pass ☐ Fail
Test 8 (Static Serving): ☐ Pass ☐ Fail
Test 9 (Large Files): ☐ Pass ☐ Fail
Test 10 (API Endpoints): ☐ Pass ☐ Fail

Overall: ☐ All Pass ☐ Some Fail

Notes:
_________________________________
_________________________________
```
