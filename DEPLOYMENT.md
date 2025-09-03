# Office Crossword - Deployment Troubleshooting

## CSS Not Loading After Deployment

If your CSS is not working after deploying remotely, here are the solutions:

### 1. **Path Issues (Most Common)**
The app now includes multiple fallback paths:
- `./css/styles.css` (relative path)
- `/css/styles.css` (absolute path)
- `css/styles.css` (relative path without dot)

### 2. **Case Sensitivity**
Some hosting platforms are case-sensitive. Ensure your folder structure matches exactly:
```
css/styles.css
scripts/crossword.js
img/stan.png
```

### 3. **File Permissions**
Make sure your CSS file has proper read permissions (usually 644).

### 4. **Hosting Platform Specific Issues**

#### **Netlify**
- Check if files are in the correct build directory
- Verify `_redirects` file if using SPA routing

#### **GitHub Pages**
- Ensure files are in the correct branch (usually `main` or `gh-pages`)
- Check if the repository is public

#### **Vercel**
- Verify build output directory
- Check deployment logs for errors

#### **Traditional Web Hosting**
- Upload files to the correct public directory
- Check if `.htaccess` is interfering

### 5. **Debug Steps**

1. **Check Browser Console** - Look for 404 errors on CSS files
2. **Inspect Network Tab** - See which CSS requests are failing
3. **Verify File URLs** - Right-click and "Open in new tab" on CSS links
4. **Check File Existence** - Ensure `css/styles.css` exists on the server

### 6. **Fallback CSS**
The app now includes inline fallback CSS that will work even if external CSS fails.

### 7. **Quick Fix Commands**
```bash
# Check if files exist
ls -la css/
ls -la scripts/

# Check file permissions
chmod 644 css/styles.css
chmod 644 scripts/crossword.js

# Verify file contents
head -5 css/styles.css
```

### 8. **Still Having Issues?**
- Check the browser console for specific error messages
- Verify the exact URL where you're hosting the files
- Test with a simple HTML file first to isolate the issue
