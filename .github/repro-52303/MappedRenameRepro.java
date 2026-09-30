import java.io.RandomAccessFile;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileChannel.MapMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * Reproduces camunda/camunda#52303 without Zeebe: run with `java MappedRenameRepro.java` (JDK 21+).
 *
 * <p>Maps a file the way Zeebe 8.9 maps a newly created journal segment, closes the opening handle,
 * then renames the file while it is still mapped, as Segment#markForDeletion does on compaction.
 *
 * <p>Expected on Windows if the hypothesis holds: RandomAccessFile FAILS with "being used by another
 * process"; FileChannel.open SUCCEEDS. On Linux/macOS both succeed.
 */
public class MappedRenameRepro {
  private static final int SIZE = 4 * 1024 * 1024;

  public static void main(final String[] args) throws Exception {
    final Path dir = Files.createTempDirectory("repro-52303");
    System.out.println("os=" + System.getProperty("os.name") + " java=" + Runtime.version());
    run("RandomAccessFile (8.9 mapNewSegment)", dir, MappedRenameRepro::mapViaRandomAccessFile);
    run("FileChannel.open (loadExistingSegment / fix)", dir, MappedRenameRepro::mapViaFileChannel);
  }

  private static void run(final String label, final Path dir, final Mapper mapper)
      throws Exception {
    final Path file = Files.createFile(dir.resolve(label.hashCode() + ".log"));
    final MappedByteBuffer buffer = mapper.map(file); // opening handle is closed on return
    buffer.put(0, (byte) 1);
    try {
      Files.move(file, file.resolveSibling(file.getFileName() + "_1-deleted"));
      System.out.println("OK    " + label);
    } catch (final Exception e) {
      System.out.println("FAIL  " + label + " -> " + e);
    }
  }

  private static MappedByteBuffer mapViaRandomAccessFile(final Path file) throws Exception {
    try (final var raf = new RandomAccessFile(file.toFile(), "rw");
        final var channel = raf.getChannel()) {
      raf.setLength(SIZE);
      return channel.map(MapMode.READ_WRITE, 0, SIZE);
    }
  }

  private static MappedByteBuffer mapViaFileChannel(final Path file) throws Exception {
    try (final var channel =
        FileChannel.open(file, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
      return channel.map(MapMode.READ_WRITE, 0, SIZE);
    }
  }

  @FunctionalInterface
  private interface Mapper {
    MappedByteBuffer map(Path file) throws Exception;
  }
}
