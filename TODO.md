
# TODO
- [x] Create test data of hundred of photos
- [x] Add recursive image scanning for a target directory based on file extensions
- [x] Make sure each valid image is sent via IPC to the correct thread as an event (memory constraint - save on redundant storage)
- [x] Implement worker threads to reduce impact of memory constraints
- [x] Create optimized image hash sorting mechanism and split work across multiple threads
- [ ] Group hashed images based on lowest distance in hash (threaded)


## ARC

start node script
-> 
resolve target directories
->
based on concurrency count create worker threads
->
on the main thread start resolving valid files via a pipe
->
send each resolved file path to a worker thread via IPC
->
each thread will store results in local file-system node (image hash, original path and file size in bytes)
->
after scanning has completed, use the same concurrency level to start comparing the dataset to find closet matches
->
use duh data thingies to do the workds lol